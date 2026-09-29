import {
  activityRequestSchema,
  planImportColumns,
  plannedMilestoneRequestSchema,
  riskRequestSchema,
  type ActivityRequest,
  type PlanImportPreview,
  type PlannedMilestoneRequest,
  type RiskRequest,
} from '@cpi/contracts';
import type { z } from 'zod';
import type { MockDb } from '../db';
import { parseCsv } from './csv';
import { latestBaseline, periodLocked } from './plans';

/**
 * Plan import (FR04): one CSV holds risks, activities and milestones, told apart by the
 * `record` column. Rows are matched to the plan by code, so a file can add and update in one
 * go. Links use codes: an activity names its risk code, a milestone its activity code.
 */

export type PlanImportRow =
  | { record: 'risk'; input: RiskRequest }
  | { record: 'activity'; input: Omit<ActivityRequest, 'riskId'>; link: string }
  | {
      record: 'milestone';
      input: Omit<PlannedMilestoneRequest, 'activityId'>;
      link: string;
    };

/** A readable sentence for each validation issue, keyed by the request field. */
export function issueMessages(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => {
      const field = issue.path.join('.');
      if (issue.code === 'too_small' && issue.origin === 'string')
        return [field, `Enter at least ${String(issue.minimum)} characters.`];
      if (issue.code === 'too_big' && issue.origin === 'string')
        return [field, `Use at most ${String(issue.maximum)} characters.`];
      if (issue.code === 'too_small' || issue.code === 'too_big')
        return [field, 'Choose a value from 1 to 5.'];
      if (issue.code === 'invalid_type')
        return [field, 'This value is required.'];
      return [field, issue.message];
    }),
  ) as Record<string, string>;
}

const labels: Record<string, string> = {
  description: 'title',
  title: 'title',
  cause: 'cause',
  probability: 'probability',
  impact: 'impact',
  strategy: 'strategy',
  output: 'output',
  kpi: 'kpi',
  target: 'target',
  owner: 'owner',
  resourceReference: 'resource',
  completionCondition: 'completion_condition',
  evidenceExpectation: 'evidence_expectation',
  code: 'code',
  periodId: 'quarter',
};

export function previewPlanImport(
  db: MockDb,
  institutionId: string,
  csv: string,
): { preview: PlanImportPreview; rows: PlanImportRow[] } {
  const [header = [], ...lines] = parseCsv(csv);
  const columns = header.map((name) => name.trim().toLowerCase());
  const fileErrors: string[] = [];
  const missing = ['record', 'code', 'title'].filter(
    (column) => !columns.includes(column),
  );
  if (missing.length)
    fileErrors.push(`Missing columns: ${missing.join(', ')}.`);
  const unknown = columns.filter(
    (column) =>
      column && !(planImportColumns as readonly string[]).includes(column),
  );
  if (unknown.length)
    fileErrors.push(`Unknown columns: ${unknown.join(', ')}.`);
  if (!lines.length) fileErrors.push('The file has no plan rows.');
  if (lines.length > 500)
    fileErrors.push('Import at most 500 plan rows at a time.');
  if (fileErrors.length)
    return {
      preview: { fileErrors, rows: [], valid: 0, invalid: 0 },
      rows: [],
    };

  const cell = (cells: string[], column: string) =>
    columns.includes(column)
      ? (cells[columns.indexOf(column)]?.trim() ?? '')
      : '';
  const own = <T extends { institutionId: string }>(items: T[]) =>
    items.filter((item) => item.institutionId === institutionId);
  const riskCodes = new Set(own(db.risks).map((risk) => risk.code));
  const activityCodes = new Set(
    own(db.activities).map((activity) => activity.code),
  );
  const seen = new Set<string>();
  // Links may point at rows later in the file, so collect the file's codes first.
  for (const cells of lines) {
    const record = cell(cells, 'record').toLowerCase();
    const code = cell(cells, 'code').toUpperCase();
    if (record === 'risk') riskCodes.add(code);
    if (record === 'activity') activityCodes.add(code);
  }

  const rows: PlanImportRow[] = [];
  const previewRows = lines.map((cells, index) => {
    const record = cell(cells, 'record').toLowerCase();
    const code = cell(cells, 'code').toUpperCase();
    const title = cell(cells, 'title');
    const link = cell(cells, 'link').toUpperCase();
    const errors: string[] = [];
    let exists = false;
    const problems = (error: z.ZodError) =>
      Object.entries(issueMessages(error)).map(
        ([field, message]) => `${labels[field] ?? field}: ${message}`,
      );
    if (cells.length > columns.length)
      errors.push('The row has more cells than the header.');
    const key = `${record}:${code}`;
    if (seen.has(key)) errors.push(`${code} appears more than once.`);
    seen.add(key);

    if (record === 'risk') {
      exists = own(db.risks).some((risk) => risk.code === code);
      const parsed = riskRequestSchema.safeParse({
        code,
        description: title,
        cause: cell(cells, 'cause'),
        probability: Number(cell(cells, 'probability')) || undefined,
        impact: Number(cell(cells, 'impact')) || undefined,
      });
      if (parsed.success) rows.push({ record: 'risk', input: parsed.data });
      else errors.push(...problems(parsed.error));
    } else if (record === 'activity') {
      exists = own(db.activities).some((activity) => activity.code === code);
      if (!riskCodes.has(link))
        errors.push(
          link
            ? `link: No risk ${link} in the plan or this file.`
            : 'link: Give the code of the risk this activity treats.',
        );
      const parsed = activityRequestSchema.omit({ riskId: true }).safeParse({
        code,
        title,
        strategy: cell(cells, 'strategy'),
        output: cell(cells, 'output'),
        kpi: cell(cells, 'kpi'),
        target: cell(cells, 'target'),
        owner: cell(cells, 'owner'),
        resourceReference: cell(cells, 'resource'),
      });
      if (parsed.success)
        rows.push({ record: 'activity', input: parsed.data, link });
      else errors.push(...problems(parsed.error));
    } else if (record === 'milestone') {
      const planned = own(db.plannedMilestones).find(
        (milestone) => milestone.code === code,
      );
      exists = Boolean(planned);
      if (!activityCodes.has(link))
        errors.push(
          link
            ? `link: No activity ${link} in the plan or this file.`
            : 'link: Give the code of the activity this milestone belongs to.',
        );
      const quarter = cell(cells, 'quarter').toUpperCase().replace(/^Q/, '');
      const period = db.cycle.periods.find(
        (candidate) => String(candidate.quarter) === quarter,
      );
      if (!period) errors.push('quarter: Use Q1, Q2, Q3 or Q4.');
      const blocked = [period?.id, planned?.periodId]
        .filter((id): id is string => Boolean(id))
        .map((id) => db.cycle.periods.find((item) => item.id === id)!)
        .find(
          (item) =>
            periodLocked(db, institutionId, item) ||
            latestBaseline(db, institutionId, item.id)?.status === 'approved',
        );
      if (blocked)
        errors.push(
          `quarter: The ${blocked.label} baseline is approved or locked; request an amendment instead.`,
        );
      const parsed = plannedMilestoneRequestSchema
        .omit({ activityId: true })
        .safeParse({
          code,
          periodId: period?.id ?? '',
          title,
          completionCondition: cell(cells, 'completion_condition'),
          evidenceExpectation: cell(cells, 'evidence_expectation'),
        });
      if (parsed.success)
        rows.push({ record: 'milestone', input: parsed.data, link });
      else
        errors.push(
          ...problems(parsed.error).filter(
            (message) => !message.startsWith('quarter:'),
          ),
        );
    } else {
      errors.push('record: Use risk, activity or milestone.');
    }
    return {
      line: index + 2,
      record,
      code,
      title,
      action: exists ? ('update' as const) : ('add' as const),
      errors,
    };
  });
  const invalid = previewRows.filter((row) => row.errors.length).length;
  return {
    preview: {
      fileErrors,
      rows: previewRows,
      valid: previewRows.length - invalid,
      invalid,
    },
    rows,
  };
}
