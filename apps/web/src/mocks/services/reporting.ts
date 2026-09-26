import type {
  Completeness,
  EvidenceAnswer,
  FormVersion,
  Milestone,
  ReportAnswers,
  ReportBundle,
} from '@cpi/contracts';
import { getDb, toEvidenceItem, type MockObligation } from '../db';
import { publishedFormForPeriod } from './forms';
import { toObligation } from './obligations';

export function periodOf(periodId: string) {
  const period = getDb().cycle.periods.find(
    (candidate) => candidate.id === periodId,
  );
  if (!period) throw new Error(`Unknown period ${periodId}`);
  return period;
}

export function baselineOf(institutionId: string, periodId: string) {
  return getDb().baselines.find(
    (baseline) =>
      baseline.institutionId === institutionId &&
      baseline.periodId === periodId,
  );
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
    questions[question.id] =
      question.type === 'evidence'
        ? { evidenceIds: [], unavailable: null }
        : question.type === 'yes_no'
          ? null
          : '';
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
    obligation: toObligation(obligation),
    period: periodOf(obligation.periodId),
    form,
    baseline: {
      status: baseline?.status ?? 'pending_approval',
      milestones: baseline?.milestones ?? [],
    },
    draft:
      db.drafts.find((draft) => draft.obligationId === obligation.id) ?? null,
    evidence: db.evidence
      .filter((item) => item.obligationId === obligation.id)
      .map(toEvidenceItem),
    receipts: db.receipts.filter(
      (receipt) => receipt.obligationId === obligation.id,
    ),
    editable:
      form !== null &&
      reportingOpen(obligation) &&
      (obligation.state === 'not_started' || obligation.state === 'draft'),
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
    if (!question.required && question.type !== 'evidence') continue;
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
    if (!filled(value))
      missing.push({
        field,
        label: question.label,
        message: 'Answer this question.',
      });
  }
  return { complete: missing.length === 0, missing, declarations };
}

/** Evidence the draft actually references, which is what a submission attaches. */
export function referencedEvidenceIds(
  answers: ReportAnswers,
  available: string[],
) {
  const ids = new Set<string>();
  for (const value of Object.values(answers.questions)) {
    if (value && typeof value === 'object' && 'evidenceIds' in value)
      value.evidenceIds.forEach((id) => ids.add(id));
  }
  for (const response of Object.values(answers.milestones))
    response.evidence.forEach((reference) => ids.add(reference.evidenceId));
  return [...ids].filter((id) => available.includes(id));
}
