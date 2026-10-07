import type { FormVersion, ReportBundle } from '@cpi/contracts';
export {
  completeness,
  emptyAnswers,
  referencedEvidenceIds,
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

function latestSubmitted(obligationId: string) {
  const latest = getDb()
    .submissions.filter(
      (submission) => submission.obligationId === obligationId,
    )
    .sort((a, b) => b.revision - a.revision)[0];
  return latest ? { revision: latest.revision, answers: latest.answers } : null;
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
    submitted: latestSubmitted(obligation.id),
    editable:
      form !== null && reportingOpen(obligation) && isEditableState(obligation),
    closure: (() => {
      const closure = db.closures.find(
        (candidate) => candidate.obligationId === obligation.id,
      );
      return closure
        ? { reason: closure.reason, by: closure.by, at: closure.at }
        : null;
    })(),
    resultPublished: db.publications.some(
      (publication) =>
        publication.institutionId === obligation.institutionId &&
        publication.supersededBy === null,
    ),
  };
}
