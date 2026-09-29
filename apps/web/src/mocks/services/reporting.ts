import {
  emptyAnswer,
  isChecklistAnswer,
  isEvidenceAnswer,
  isRowsAnswer,
  limitProblem,
  type Completeness,
  type EvidenceAnswer,
  type FormVersion,
  type Milestone,
  type ReportAnswers,
  type ReportBundle,
} from '@cpi/contracts';
import { getDb, toEvidenceItem, type MockObligation } from '../db';
import { clarificationsFor } from './clarifications';
import { publishedFormForPeriod } from './forms';
import { toObligation } from './obligations';

export function periodOf(periodId: string) {
  const period = getDb().cycle.periods.find(
    (candidate) => candidate.id === periodId,
  );
  if (!period) throw new Error(`Unknown period ${periodId}`);
  return period;
}

/** The latest baseline version for a period; earlier versions stay in history. */
export function baselineOf(institutionId: string, periodId: string) {
  return getDb()
    .baselines.filter(
      (baseline) =>
        baseline.institutionId === institutionId &&
        baseline.periodId === periodId,
    )
    .sort((a, b) => b.version - a.version)[0];
}

/** A draft keeps the version it started on; otherwise the period's current published version. */
export function formForObligation(
  obligation: MockObligation,
): FormVersion | undefined {
  const db = getDb();
  const draft = db.drafts.find(
    (candidate) => candidate.obligationId === obligation.id,
  );
  const latest = db.submissions
    .filter((submission) => submission.obligationId === obligation.id)
    .at(-1);
  const pinned = draft?.formVersionId ?? latest?.formVersionId;
  return pinned
    ? db.forms.find((form) => form.id === pinned)
    : publishedFormForPeriod(obligation.periodId);
}

/** Drafts are open before first submission, and again while a clarification awaits a revision. */
export function isEditableState(obligation: MockObligation) {
  return (
    obligation.state === 'not_started' ||
    obligation.state === 'draft' ||
    obligation.state === 'clarification_requested'
  );
}

export function reportingOpen(obligation: MockObligation) {
  return !toObligation(obligation).flags.includes('not_yet_due');
}

export function emptyAnswers(
  form: FormVersion,
  milestones: Milestone[],
): ReportAnswers {
  const questions: ReportAnswers['questions'] = {};
  for (const question of form.sections.flatMap(
    (section) => section.questions,
  )) {
    if (question.type === 'milestone_progress') continue;
    questions[question.id] = emptyAnswer(question);
  }
  const milestoneAnswers: ReportAnswers['milestones'] = {};
  for (const milestone of milestones) {
    milestoneAnswers[milestone.id] = {
      completed: null,
      output: '',
      emergingIssues: '',
      actions: '',
      evidence: [],
      evidenceUnavailable: null,
    };
  }
  return { questions, milestones: milestoneAnswers };
}

export function reportBundle(obligation: MockObligation): ReportBundle {
  const db = getDb();
  const form = formForObligation(obligation) ?? null;
  const baseline = baselineOf(obligation.institutionId, obligation.periodId);
  return {
    obligation: toObligation(obligation, 'institution'),
    period: periodOf(obligation.periodId),
    form,
    baseline: {
      status: baseline?.status === 'approved' ? 'approved' : 'pending_approval',
      milestones: baseline?.milestones ?? [],
    },
    clarifications: clarificationsFor(obligation.id),
    draft:
      db.drafts.find((draft) => draft.obligationId === obligation.id) ?? null,
    evidence: db.evidence
      .filter((item) => item.obligationId === obligation.id)
      .map(toEvidenceItem),
    receipts: db.receipts.filter(
      (receipt) => receipt.obligationId === obligation.id,
    ),
    editable:
      form !== null && reportingOpen(obligation) && isEditableState(obligation),
  };
}

const filled = (value: unknown) =>
  typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined;

/**
 * Server-side completion check (PRD §7.2): separates unanswered items, which block submission,
 * from honest declarations, which are submittable.
 */
export function completeness(
  form: FormVersion,
  milestones: Milestone[],
  answers: ReportAnswers,
  evidenceIds: string[],
): Completeness {
  const missing: Completeness['missing'] = [];
  const declarations: Completeness['declarations'] = [];
  for (const question of form.sections.flatMap(
    (section) => section.questions,
  )) {
    const field = `questions.${question.id}`;
    if (question.type === 'milestone_progress') {
      for (const milestone of milestones) {
        const base = `milestones.${milestone.id}`;
        const label = `${milestone.code} ${milestone.title}`;
        const response = answers.milestones[milestone.id];
        if (!response || response.completed === null) {
          missing.push({
            field: `${base}.completed`,
            label,
            message: 'Say whether this milestone was completed.',
          });
          continue;
        }
        if (response.completed) {
          if (!response.output.trim())
            missing.push({
              field: `${base}.output`,
              label,
              message: 'Describe the output achieved.',
            });
          const references = response.evidence.filter((reference) =>
            evidenceIds.includes(reference.evidenceId),
          );
          if (references.length === 0 && !response.evidenceUnavailable) {
            missing.push({
              field: `${base}.evidence`,
              label,
              message:
                'Reference supporting evidence, or declare that it is not available.',
            });
          }
          if (references.some((reference) => !reference.passage.trim())) {
            missing.push({
              field: `${base}.evidence`,
              label,
              message: 'Give the page or section for each referenced file.',
            });
          }
          if (response.evidenceUnavailable) {
            if (response.evidenceUnavailable.explanation.trim().length < 10) {
              missing.push({
                field: `${base}.evidenceUnavailable`,
                label,
                message:
                  'Explain why the evidence is not available (at least 10 characters).',
              });
            } else {
              declarations.push({
                field: `${base}.evidenceUnavailable`,
                label,
                message: `Evidence declared not available: ${response.evidenceUnavailable.explanation}`,
              });
            }
          }
        } else {
          if (!response.emergingIssues.trim())
            missing.push({
              field: `${base}.emergingIssues`,
              label,
              message: 'Explain why the milestone was not completed.',
            });
          declarations.push({
            field: `${base}.completed`,
            label,
            message: 'Declared not completed this quarter.',
          });
        }
      }
      continue;
    }
    const value = answers.questions[question.id];
    if (question.type === 'evidence') {
      const answer = (value ?? {
        evidenceIds: [],
        unavailable: null,
      }) as EvidenceAnswer;
      const supplied = answer.evidenceIds.filter((id) =>
        evidenceIds.includes(id),
      );
      if (answer.unavailable) {
        if (answer.unavailable.explanation.trim().length < 10)
          missing.push({
            field: `${field}.unavailable`,
            label: question.label,
            message:
              'Explain why this is not available (at least 10 characters).',
          });
        else
          declarations.push({
            field: `${field}.unavailable`,
            label: question.label,
            message: `Declared not available: ${answer.unavailable.explanation}`,
          });
      } else if (question.required && supplied.length === 0) {
        missing.push({
          field,
          label: question.label,
          message: 'Upload the document, or declare that it is not available.',
        });
      }
      continue;
    }
    if (question.type === 'checklist') {
      const answer = isChecklistAnswer(value) ? value : { items: {} };
      const open = (question.items ?? []).filter(
        (item) => typeof answer.items[item.id] !== 'boolean',
      );
      if (question.required && open.length)
        missing.push({
          field,
          label: question.label,
          message: `Mark every item done or not done (${open.length} left).`,
        });
      continue;
    }
    if (question.type === 'repeated') {
      const rows = (isRowsAnswer(value) ? value.rows : []).filter((row) =>
        Object.values(row).some(filled),
      );
      const fewest = question.minRows ?? (question.required ? 1 : 0);
      if (rows.length < fewest)
        missing.push({
          field,
          label: question.label,
          message:
            fewest === 1
              ? 'Add at least one row.'
              : `Add at least ${fewest} rows.`,
        });
      rows.forEach((row, index) => {
        for (const column of question.columns ?? []) {
          const cell = row[column.id];
          const problem = filled(cell)
            ? limitProblem(column.limits, column.type, cell)
            : column.required
              ? 'Fill this in.'
              : null;
          if (problem)
            missing.push({
              field,
              label: `${question.label}, row ${index + 1}: ${column.label}`,
              message: problem,
            });
        }
      });
      continue;
    }
    if (!filled(value)) {
      if (question.required)
        missing.push({
          field,
          label: question.label,
          message: 'Answer this question.',
        });
      continue;
    }
    const problem = limitProblem(question.limits, question.type, value);
    if (problem)
      missing.push({ field, label: question.label, message: problem });
  }
  return { complete: missing.length === 0, missing, declarations };
}

/** Evidence the draft actually references, which is what a submission attaches. */
export function referencedEvidenceIds(
  answers: ReportAnswers,
  available: string[],
) {
  const ids = new Set<string>();
  for (const value of Object.values(answers.questions))
    if (isEvidenceAnswer(value)) value.evidenceIds.forEach((id) => ids.add(id));
  for (const response of Object.values(answers.milestones))
    response.evidence.forEach((reference) => ids.add(reference.evidenceId));
  return [...ids].filter((id) => available.includes(id));
}
