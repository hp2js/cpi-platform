import {
  describeLimits,
  type Column,
  type FormChange,
  type FormVersion,
  type Question,
} from '@cpi/contracts';

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
