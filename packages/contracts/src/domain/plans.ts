import type { z } from 'zod';
import type {
  Activity,
  DayCounting,
  Milestone,
  Period,
  Foundations,
  Plan,
  PlanImportPreview,
  PlannedMilestone,
  PlanningWork,
  PlanningWorkItem,
} from '../index.js';
import {
  activityRequestSchema,
  planImportColumns,
  plannedMilestoneRequestSchema,
  riskRequestSchema,
  type ActivityRequest,
  type PlannedMilestoneRequest,
  type RiskRequest,
} from '../draft/planning.js';
import { committee, committeeCodes } from '../fixtures/baselines.js';
import { parseCsv } from './csv.js';
import { endOfDay, shiftDays } from './days.js';

/*
 * Institution plan rules shared by the API and the development mock (FR04): when proposals
 * are due, what a proposal holds, and the plan CSV import.
 */

/** Proposals are due the configured number of counted days before the quarter starts. */
export function proposalDueAt(period: Period, rule: DayCounting) {
  return endOfDay(shiftDays(period.startsOn, -rule.proposalLeadDays, rule));
}

export const periodStartsAt = (period: Period) =>
  `${period.startsOn}T00:00:00+03:00`;

/** Reporting opens when the quarter ends; from then its baseline is fixed (PRD §10.4). */
export const periodEnded = (period: Period, businessTime: string) =>
  Date.parse(businessTime) > Date.parse(endOfDay(period.endsOn));

/**
 * The quarter's baseline as it would be proposed now: the planned milestones, labelled with
 * their activity and risk, and the committee meetings. A quarter keeps the committee
 * milestones it already has, so their identifiers stay stable.
 */
export function buildProposal(input: {
  institutionId: string;
  period: Period;
  planned: Pick<
    PlannedMilestone,
    | 'id'
    | 'code'
    | 'activityId'
    | 'title'
    | 'completionCondition'
    | 'evidenceExpectation'
  >[];
  activities: Pick<Activity, 'id' | 'code' | 'title' | 'riskId'>[];
  risks: { id: string; code: string; description: string }[];
  existing: Milestone[] | undefined;
}): Milestone[] {
  const substantive = [...input.planned]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((milestone): Milestone => {
      const activity = input.activities.find(
        (candidate) => candidate.id === milestone.activityId,
      );
      const risk = input.risks.find(
        (candidate) => candidate.id === activity?.riskId,
      );
      return {
        id: milestone.id,
        code: milestone.code,
        title: milestone.title,
        activity: activity ? `${activity.code} ${activity.title}` : '',
        risk: risk ? `${risk.code} ${risk.description}` : '',
        activityId: milestone.activityId,
        completionCondition: milestone.completionCondition,
        evidenceExpectation: milestone.evidenceExpectation,
        weight: 1,
        mandatory: false,
      };
    });
  const existing = input.existing?.filter((milestone) => milestone.mandatory);
  const committees =
    existing && existing.length >= 2
      ? existing
      : committee(input.institutionId, ...committeeCodes(input.period.quarter));
  return [...substantive, ...committees];
}

/** What makes two versions' planned milestones the same, ignoring order. */
export function sameMilestones(a: Milestone[], b: Milestone[]) {
  const signature = (milestones: Milestone[]) =>
    JSON.stringify(
      milestones
        .filter((milestone) => !milestone.mandatory)
        .map((milestone) => [
          milestone.id,
          milestone.code,
          milestone.title,
          milestone.activityId,
          milestone.completionCondition,
          milestone.evidenceExpectation,
        ])
        .sort(),
    );
  return signature(a) === signature(b);
}

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

/** What the import checks the file against: the plan so far and which quarters are closed. */
export interface PlanImportContext {
  risks: { code: string }[];
  activities: { code: string }[];
  plannedMilestones: { code: string; periodId: string }[];
  periods: Period[];
  /** Approved or locked quarters take no new or changed milestones. */
  closedPeriodIds: Set<string>;
}

/** Only a well-formed code is repeated back; anything else from the file is never echoed. */
const wellFormed = (code: string) => /^[A-Z]{1,3}-\d{2,3}$/.test(code);
const shown = (code: string) => (wellFormed(code) ? code : 'This code');
const named = (code: string) => (wellFormed(code) ? code : 'with that code');

export function previewPlanImport(
  context: PlanImportContext,
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
  const riskCodes = new Set(context.risks.map((risk) => risk.code));
  const activityCodes = new Set(
    context.activities.map((activity) => activity.code),
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
    if (seen.has(key)) errors.push(`${shown(code)} appears more than once.`);
    seen.add(key);

    if (record === 'risk') {
      exists = context.risks.some((risk) => risk.code === code);
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
      exists = context.activities.some((activity) => activity.code === code);
      if (!riskCodes.has(link))
        errors.push(
          link
            ? `link: No risk ${named(link)} in the plan or this file.`
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
      const planned = context.plannedMilestones.find(
        (milestone) => milestone.code === code,
      );
      exists = Boolean(planned);
      if (!activityCodes.has(link))
        errors.push(
          link
            ? `link: No activity ${named(link)} in the plan or this file.`
            : 'link: Give the code of the activity this milestone belongs to.',
        );
      const quarter = cell(cells, 'quarter').toUpperCase().replace(/^Q/, '');
      const period = context.periods.find(
        (candidate) => String(candidate.quarter) === quarter,
      );
      if (!period) errors.push('quarter: Use Q1, Q2, Q3 or Q4.');
      const blocked = [period?.id, planned?.periodId]
        .filter((id): id is string => Boolean(id))
        .map((id) => context.periods.find((item) => item.id === id)!)
        .find((item) => context.closedPeriodIds.has(item.id));
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

/* Plan work waiting on an officer (HP2-52) */

type WorkOwner = Pick<
  PlanningWorkItem,
  'institutionId' | 'institutionName' | 'officerId' | 'officerName'
>;

const shortDate = (instant: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(new Date(instant));

/**
 * What an institution's plan and foundation documents wait on from its officer, as of
 * `now`. Shared by the API and the mock so the work views agree (HP2-52).
 */
export function planningWorkFor(
  owner: WorkOwner,
  plan: Plan,
  foundations: Foundations,
  now: string,
): PlanningWorkItem[] {
  const at = Date.parse(now);
  const items: PlanningWorkItem[] = [];
  const latest = (periodId: string) =>
    plan.baselines
      .filter((baseline) => baseline.periodId === periodId)
      .sort((a, b) => b.version - a.version)[0];
  for (const proposal of plan.proposals) {
    const baseline = latest(proposal.periodId);
    if (proposal.status === 'proposed' && baseline?.status === 'proposed') {
      const started = at >= Date.parse(proposal.startsAt);
      const late = at > Date.parse(proposal.dueAt);
      items.push({
        ...owner,
        id: `proposal:${baseline.id}`,
        kind: 'proposal',
        title: `${proposal.periodLabel} baseline proposal to approve or return`,
        tab: 'baselines',
        dueAt: proposal.dueAt,
        flag: started
          ? `${proposal.periodLabel} started on ${shortDate(proposal.startsAt)} without an approved baseline`
          : late
            ? `Proposal deadline ${shortDate(proposal.dueAt)} has passed`
            : null,
      });
    }
  }
  for (const baseline of plan.baselines)
    if (baseline.historicalSeed && !baseline.historicalSeed.confirmedAt)
      items.push({
        ...owner,
        id: `seed:${baseline.id}`,
        kind: 'seed_confirmation',
        title: `${baseline.periodLabel} seeded baseline to confirm against the approved plan`,
        tab: 'baselines',
        dueAt: null,
        flag: baseline.locked
          ? `${baseline.periodLabel} reporting has opened; its reviews cannot be finalized until this is confirmed`
          : null,
      });
  for (const amendment of plan.amendments)
    if (amendment.status === 'pending')
      items.push({
        ...owner,
        id: `amendment:${amendment.id}`,
        kind: 'amendment',
        title: `Amendment to ${amendment.milestoneCode} to confirm or decline`,
        tab: 'amendments',
        dueAt: null,
        flag: null,
      });
  for (const indicator of foundations.indicators) {
    const active = indicator.versions.find(
      (version) => version.status === 'active',
    );
    if (active && indicator.review?.versionId !== active.id)
      items.push({
        ...owner,
        id: `foundation:${active.id}`,
        kind: 'foundation',
        title: `${indicator.label} version ${active.version} to review`,
        tab: 'foundations',
        dueAt: foundations.deadline,
        flag: null,
      });
  }
  return items;
}

/** Flagged first, then by due date (undated last), then by institution. */
export function planningWorkSummary(items: PlanningWorkItem[]): PlanningWork {
  const sorted = [...items].sort(
    (a, b) =>
      Number(b.flag !== null) - Number(a.flag !== null) ||
      (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
        (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
      a.institutionId.localeCompare(b.institutionId),
  );
  const officers = new Map<string, PlanningWork['byOfficer'][number]>();
  for (const item of sorted) {
    if (!item.officerId) continue;
    const row = officers.get(item.officerId) ?? {
      officerId: item.officerId,
      officerName: item.officerName ?? item.officerId,
      items: 0,
      flagged: 0,
    };
    row.items += 1;
    if (item.flag) row.flagged += 1;
    officers.set(item.officerId, row);
  }
  return {
    items: sorted,
    totals: {
      items: sorted.length,
      flagged: sorted.filter((item) => item.flag).length,
    },
    byOfficer: [...officers.values()].sort((a, b) =>
      a.officerName.localeCompare(b.officerName),
    ),
  };
}
