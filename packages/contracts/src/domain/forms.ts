import type {
  Column,
  Cycle,
  FormChange,
  FormCreation,
  FormPeriodImpact,
  FormIssue,
  FormVersion,
  Question,
} from '../index.js';
import { describeLimits } from '../draft/forms.js';

/*
 * Form version rules shared by the API and the development mock (FR03): the checks on
 * checklists, repeated rows and limits, IDs that keep their meaning across versions, and the
 * plain-words summary of what a version changes.
 */

/**
 * An ID keeps its meaning in every version: a question ID from an earlier version never
 * returns as another type, nor a repeated-row column ID.
 */
export function stableIdIssues(
  form: FormVersion,
  earlier: FormVersion[],
): FormIssue[] {
  const issues: FormIssue[] = [];
  form.sections.forEach((section, sectionIndex) =>
    section.questions.forEach((question, questionIndex) => {
      const path = `sections.${sectionIndex}.questions.${questionIndex}`;
      for (const version of earlier) {
        const previous = version.sections
          .flatMap((candidate) => candidate.questions)
          .find((candidate) => candidate.id === question.id);
        if (!previous) continue;
        if (previous.type !== question.type) {
          issues.push({
            path: `${path}.id`,
            message: `Question ID "${question.id}" was a ${previous.type.replace('_', ' ')} question in version ${version.version}. A different question needs a new ID.`,
          });
          break;
        }
        const clash = (question.columns ?? []).find((column) => {
          const old = previous.columns?.find((item) => item.id === column.id);
          return old && old.type !== column.type;
        });
        if (clash) {
          issues.push({
            path: `${path}.columns`,
            message: `Column ID "${clash.id}" had another type in version ${version.version}. A different column needs a new ID.`,
          });
          break;
        }
      }
    }),
  );

  return issues;
}

const TEXT_TYPES = ['text', 'long_text'];

function limitIssues(
  limits: Question['limits'],
  type: string,
  path: string,
): FormIssue[] {
  if (!limits) return [];
  const issues: FormIssue[] = [];
  const numeric =
    limits.min !== undefined ||
    limits.max !== undefined ||
    limits.integer ||
    limits.unit;
  if (numeric && type !== 'number')
    issues.push({
      path: `${path}.limits`,
      message: 'A range, whole numbers or a unit apply only to numbers.',
    });
  if (limits.maxLength && !TEXT_TYPES.includes(type))
    issues.push({
      path: `${path}.limits`,
      message: 'A length limit applies only to text.',
    });
  if ((limits.earliest || limits.latest) && type !== 'date')
    issues.push({
      path: `${path}.limits`,
      message: 'A date range applies only to dates.',
    });
  if (
    limits.min !== undefined &&
    limits.max !== undefined &&
    limits.min > limits.max
  )
    issues.push({
      path: `${path}.limits`,
      message: 'The lowest value must not be above the highest.',
    });
  if (limits.earliest && limits.latest && limits.earliest > limits.latest)
    issues.push({
      path: `${path}.limits`,
      message: 'The earliest date must not be after the latest.',
    });
  return issues;
}

/** Rules for the checklist and repeated-row types, and limits on any type. */
export function questionTypeIssues(
  question: Question,
  path: string,
): FormIssue[] {
  const issues = limitIssues(question.limits, question.type, path);
  if (question.type === 'checklist') {
    const items = question.items ?? [];
    if (items.length < 1)
      issues.push({
        path: `${path}.items`,
        message: 'A checklist needs at least one item.',
      });
    if (items.some((item) => !item.label.trim()))
      issues.push({
        path: `${path}.items`,
        message: 'Give every checklist item a label.',
      });
    if (new Set(items.map((item) => item.id)).size !== items.length)
      issues.push({
        path: `${path}.items`,
        message: 'Checklist item IDs must be unique.',
      });
  }
  if (question.type === 'repeated') {
    const columns = question.columns ?? [];
    if (columns.length < 1)
      issues.push({
        path: `${path}.columns`,
        message: 'Repeated rows need at least one column.',
      });
    if (new Set(columns.map((column) => column.id)).size !== columns.length)
      issues.push({
        path: `${path}.columns`,
        message: 'Column IDs must be unique.',
      });
    columns.forEach((column, index) => {
      const columnPath = `${path}.columns.${index}`;
      if (!column.label.trim())
        issues.push({
          path: `${columnPath}.label`,
          message: 'Give every column a label.',
        });
      if (
        column.type === 'choice' &&
        (column.choices?.filter((choice) => choice.trim()).length ?? 0) < 2
      )
        issues.push({
          path: `${columnPath}.choices`,
          message: 'A choice column needs at least two options.',
        });
      issues.push(...limitIssues(column.limits, column.type, columnPath));
    });
    if (
      question.minRows !== undefined &&
      question.maxRows !== undefined &&
      question.minRows > question.maxRows
    )
      issues.push({
        path: `${path}.minRows`,
        message: 'The fewest rows must not be more than the most rows.',
      });
  }
  return issues;
}

/**
 * What a draft version changes compared with the version it was based on, in words an
 * administrator, officer or focal person can read (FR03, AT04). Stable IDs make the match.
 */

const categoryLabels: Record<string, string> = {
  cpc_minutes: 'CPC minutes',
  iao_minutes: 'IAO minutes',
  procedures: 'Procedures',
  risk_assessment: 'Risk assessment',
  mitigation_plan: 'Mitigation plan',
  other: 'Other',
};

function listDiff(
  before: string[],
  after: string[],
  noun: string,
): string | null {
  const added = after.filter((item) => !before.includes(item));
  const removed = before.filter((item) => !after.includes(item));
  const parts = [
    added.length && `added ${added.map((item) => `“${item}”`).join(', ')}`,
    removed.length &&
      `removed ${removed.map((item) => `“${item}”`).join(', ')}`,
  ].filter(Boolean);
  if (parts.length) return `${noun}: ${parts.join('; ')}`;
  return JSON.stringify(before) === JSON.stringify(after)
    ? null
    : `${noun} reordered`;
}

function columnDetails(before: Column[], after: Column[]) {
  const details: string[] = [];
  const beforeIds = before.map((column) => column.id);
  const afterIds = after.map((column) => column.id);
  const added = after.filter((column) => !beforeIds.includes(column.id));
  const removed = before.filter((column) => !afterIds.includes(column.id));
  if (added.length)
    details.push(
      `Columns added: ${added.map((column) => `“${column.label}”`).join(', ')}`,
    );
  if (removed.length)
    details.push(
      `Columns removed: ${removed.map((column) => `“${column.label}”`).join(', ')}`,
    );
  for (const column of after) {
    const previous = before.find((candidate) => candidate.id === column.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(column))
      details.push(`Column “${column.label}” changed`);
  }
  return details;
}

function questionDetails(before: Question, after: Question) {
  const details: string[] = [];
  if (before.label !== after.label) details.push('Wording changed');
  if ((before.help ?? '') !== (after.help ?? ''))
    details.push('Help text changed');
  if (before.required !== after.required)
    details.push(after.required ? 'Now required' : 'Now optional');
  if (before.evidenceCategory !== after.evidenceCategory)
    details.push(
      `Evidence category → ${categoryLabels[after.evidenceCategory ?? 'other']}`,
    );
  const choices = listDiff(
    before.choices ?? [],
    after.choices ?? [],
    'Options',
  );
  if (choices) details.push(choices);
  if (
    JSON.stringify(before.limits ?? {}) !== JSON.stringify(after.limits ?? {})
  )
    details.push(`Limits → ${describeLimits(after.limits)}`);
  const items = listDiff(
    (before.items ?? []).map((item) => item.label),
    (after.items ?? []).map((item) => item.label),
    'Checklist items',
  );
  if (items) details.push(items);
  details.push(...columnDetails(before.columns ?? [], after.columns ?? []));
  if (before.minRows !== after.minRows || before.maxRows !== after.maxRows)
    details.push(`Rows → ${after.minRows ?? 0} to ${after.maxRows ?? 50}`);
  return details;
}

export function diffForms(
  base: FormVersion | undefined,
  form: FormVersion,
  periodLabel: (periodId: string) => string,
): FormChange[] {
  if (!base) return [];
  const changes: FormChange[] = [];
  const locate = (version: FormVersion) =>
    new Map(
      version.sections.flatMap((section) =>
        section.questions.map(
          (question) => [question.id, { question, section }] as const,
        ),
      ),
    );
  const before = locate(base);
  const after = locate(form);

  for (const section of form.sections) {
    const previous = base.sections.find(
      (candidate) => candidate.id === section.id,
    );
    if (!previous)
      changes.push({
        kind: 'added',
        target: 'section',
        id: section.id,
        label: section.title,
        details: [],
      });
    else if (
      previous.title !== section.title ||
      (previous.description ?? '') !== (section.description ?? '')
    )
      changes.push({
        kind: 'changed',
        target: 'section',
        id: section.id,
        label: section.title,
        details: [
          previous.title !== section.title
            ? `Renamed from “${previous.title}”`
            : 'Description changed',
        ],
      });
  }
  for (const section of base.sections)
    if (!form.sections.some((candidate) => candidate.id === section.id))
      changes.push({
        kind: 'removed',
        target: 'section',
        id: section.id,
        label: section.title,
        details: [],
      });

  for (const [id, { question, section }] of after) {
    const previous = before.get(id);
    if (!previous) {
      changes.push({
        kind: 'added',
        target: 'question',
        id,
        label: question.label,
        details: [`In “${section.title}”`],
      });
      continue;
    }
    const details = questionDetails(previous.question, question);
    if (previous.section.id !== section.id)
      details.push(`Moved to “${section.title}”`);
    if (details.length)
      changes.push({
        kind: 'changed',
        target: 'question',
        id,
        label: question.label,
        details,
      });
  }
  for (const [id, { question }] of before)
    if (!after.has(id))
      changes.push({
        kind: 'removed',
        target: 'question',
        id,
        label: question.label,
        details: [],
      });

  const kept = base.periodIds.filter((id) => !form.periodIds.includes(id));
  changes.push({
    kind: 'periods',
    target: 'form',
    id: 'periods',
    label: 'Quarters',
    details: [
      form.periodIds.length
        ? `${form.periodIds.map(periodLabel).join(', ')} will use version ${form.version}`
        : 'No quarters assigned yet',
      ...(kept.length
        ? [
            `${kept.map(periodLabel).join(', ')} ${kept.length === 1 ? 'keeps' : 'keep'} version ${base.version}`,
          ]
        : []),
    ],
  });
  return changes;
}

/** "2 questions added (…), 1 changed": a one-line summary for notifications. */
export function summarizeChanges(changes: FormChange[]) {
  const questions = changes.filter((change) => change.target === 'question');
  const count = (kind: FormChange['kind']) =>
    questions.filter((change) => change.kind === kind);
  const phrase = (list: FormChange[], verb: string) =>
    list.length
      ? `${list.length} ${list.length === 1 ? 'question' : 'questions'} ${verb} (${list
          .slice(0, 3)
          .map((change) => change.label)
          .join('; ')}${list.length > 3 ? '; …' : ''})`
      : null;
  return (
    [
      phrase(count('added'), 'added'),
      phrase(count('changed'), 'changed'),
      phrase(count('removed'), 'removed'),
    ]
      .filter(Boolean)
      .join(', ') || 'No question changes'
  );
}

/**
 * What publishing `form` would do to each period of the cycle (FR03): periods it is assigned
 * to move to it (or get their first version), the rest keep theirs, and a period that has
 * started reporting cannot move. `locked` is the caller's period lock rule.
 */
export function periodImpact(
  form: Pick<FormVersion, 'id' | 'version' | 'periodIds'>,
  forms: FormVersion[],
  cycle: Cycle,
  locked: (periodId: string) => boolean,
): FormPeriodImpact[] {
  return cycle.periods.map((period) => {
    const current = forms
      .filter(
        (candidate) =>
          candidate.id !== form.id &&
          candidate.status === 'published' &&
          candidate.periodIds.includes(period.id),
      )
      .sort((a, b) => b.version - a.version)[0];
    const currentVersion = current?.version ?? null;
    const base = { periodId: period.id, label: period.label, currentVersion };
    if (!form.periodIds.includes(period.id))
      return { ...base, outcome: 'keeps', nextVersion: currentVersion };
    if (current && locked(period.id))
      return { ...base, outcome: 'locked', nextVersion: currentVersion };
    return {
      ...base,
      outcome: current ? 'moves' : 'assigned',
      nextVersion: form.version,
    };
  });
}

/**
 * Whether a new version can be started (FR03). It needs a period that has not started
 * reporting, and the one open draft must be published or discarded first; a draft whose
 * periods have all started is called out, since it can only be reassigned or discarded.
 */
export function formCreation(
  forms: FormVersion[],
  cycle: Cycle,
  locked: (periodId: string) => boolean,
): FormCreation {
  const assignablePeriods = cycle.periods
    .filter((period) => !locked(period.id))
    .map((period) => ({ id: period.id, label: period.label }));
  const draft = forms.find((form) => form.status === 'draft');
  const published = forms.some((form) => form.status === 'published');
  const reason = !published
    ? 'Publish the first version before creating another.'
    : assignablePeriods.length === 0
      ? 'Every period in this cycle has started reporting, so a new version would have no period to use it. Started periods keep the version they started on.'
      : draft
        ? draft.periodIds.some((id) =>
            assignablePeriods.some((period) => period.id === id),
          )
          ? `Draft version ${draft.version} is already open. Publish or discard it before starting another.`
          : `Draft version ${draft.version} has no period that can still use it, so it cannot be published as it is. Assign it to ${assignablePeriods.map((period) => period.label).join(', ')}, or discard it, before starting another.`
        : null;
  return { allowed: reason === null, reason, assignablePeriods };
}
