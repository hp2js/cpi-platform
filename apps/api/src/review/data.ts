import { asc, desc, inArray } from 'drizzle-orm';
import {
  scoreSummary,
  type Decision,
  type EvidenceLookupItem,
  type Obligation,
  type ReviewBundle,
  type ReviewQueueItem,
} from '@cpi/contracts';
import { assignedInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import type { Db } from '../database/db';
import {
  baselines,
  clarifications,
  corrections,
  decisions,
  evidence,
  formVersions,
  institutions,
  obligations,
  oversightComments,
  periods,
  publications,
  receipts,
  reopenings,
  submissions,
  suitability,
} from '../database/schema';
import { currentState } from '../database/state';
import { toObligations } from '../directory/obligations';
import { toEvidenceItem } from '../reporting/report';
import { toClarifications } from './clarifications';

/*
 * The review workflow's view of its records (PRD §7.3, FR08–FR10). Everything for the given
 * institutions is loaded in one go (at most 8 institutions × 4 quarters × a few revisions),
 * and the mock API's derivations are ported over it unchanged.
 */

export type SubmissionRow = typeof submissions.$inferSelect;
type DecisionRow = typeof decisions.$inferSelect;

export async function loadReviewData(db: Db, institutionIds: string[]) {
  const scope = institutionIds.length ? institutionIds : ['(none)'];
  const obligationRows = await db
    .select()
    .from(obligations)
    .where(inArray(obligations.institutionId, scope))
    .orderBy(asc(obligations.id));
  const obligationIds = obligationRows.length
    ? obligationRows.map((row) => row.id)
    : ['(none)'];
  const [
    { state, profile },
    views,
    submissionRows,
    decisionRows,
    receiptRows,
    baselineRows,
    evidenceRows,
    suitabilityRows,
    clarificationRows,
    commentRows,
    reopeningRows,
    formRows,
    periodRows,
    institutionRows,
    publicationRows,
    correctionRows,
  ] = await Promise.all([
    currentState(db),
    toObligations(db, obligationRows),
    db
      .select()
      .from(submissions)
      .where(inArray(submissions.obligationId, obligationIds))
      .orderBy(asc(submissions.obligationId), asc(submissions.revision)),
    db
      .select()
      .from(decisions)
      .where(inArray(decisions.obligationId, obligationIds))
      .orderBy(asc(decisions.seq)),
    db
      .select()
      .from(receipts)
      .where(inArray(receipts.obligationId, obligationIds)),
    db
      .select()
      .from(baselines)
      .where(inArray(baselines.institutionId, scope))
      .orderBy(desc(baselines.version)),
    db
      .select()
      .from(evidence)
      .where(inArray(evidence.institutionId, scope))
      .orderBy(asc(evidence.seq)),
    db.select().from(suitability),
    db
      .select()
      .from(clarifications)
      .where(inArray(clarifications.obligationId, obligationIds))
      .orderBy(asc(clarifications.seq)),
    db
      .select()
      .from(oversightComments)
      .where(inArray(oversightComments.obligationId, obligationIds))
      .orderBy(asc(oversightComments.seq)),
    db
      .select()
      .from(reopenings)
      .where(inArray(reopenings.obligationId, obligationIds))
      .orderBy(asc(reopenings.id)),
    db.select().from(formVersions),
    db.select().from(periods),
    db.select().from(institutions),
    db
      .select()
      .from(publications)
      .where(inArray(publications.institutionId, scope)),
    db
      .select()
      .from(corrections)
      .where(inArray(corrections.institutionId, scope)),
  ]);
  return {
    businessTime: state.businessTime,
    profile,
    obligations: obligationRows,
    views: new Map<string, Obligation>(views.map((view) => [view.id, view])),
    submissions: submissionRows,
    decisions: decisionRows,
    receipts: new Map(receiptRows.map((row) => [row.id, row.receipt])),
    baselines: baselineRows,
    evidence: evidenceRows,
    suitability: suitabilityRows,
    clarifications: await toClarifications(db, clarificationRows),
    comments: commentRows,
    reopenings: reopeningRows,
    forms: formRows,
    periods: periodRows,
    institutions: institutionRows,
    publications: publicationRows,
    corrections: correctionRows,
  };
}

export type ReviewData = Awaited<ReturnType<typeof loadReviewData>>;

export const obligationOf = (data: ReviewData, submission: SubmissionRow) =>
  data.obligations.find(
    (obligation) => obligation.id === submission.obligationId,
  )!;

export const periodOf = (data: ReviewData, periodId: string) =>
  data.periods.find((period) => period.id === periodId)!;

/** The latest baseline version for a period (rows are loaded newest first). */
export const baselineOf = (
  data: ReviewData,
  institutionId: string,
  periodId: string,
) =>
  data.baselines.find(
    (baseline) =>
      baseline.institutionId === institutionId &&
      baseline.periodId === periodId,
  );

export const milestonesOf = (data: ReviewData, submission: SubmissionRow) => {
  const obligation = obligationOf(data, submission);
  return (
    baselineOf(data, obligation.institutionId, obligation.periodId)
      ?.milestones ?? []
  );
};

export const toDecision = (decision: DecisionRow): Decision => ({
  id: decision.id,
  milestoneId: decision.milestoneId,
  outcome: decision.outcome,
  reason: decision.reason,
  revision: decision.revision,
  decidedBy: decision.decidedBy,
  decidedAt: decision.decidedAt,
  carriedForwardFrom: decision.carriedForwardFrom,
  supersededAt: decision.supersededAt,
});

/** Current (non-superseded) decisions recorded against one submission revision. */
export const activeDecisions = (data: ReviewData, submission: SubmissionRow) =>
  data.decisions.filter(
    (decision) =>
      decision.submissionId === submission.id && decision.supersededAt === null,
  );

function previousSubmission(data: ReviewData, submission: SubmissionRow) {
  return data.submissions.find(
    (candidate) =>
      candidate.obligationId === submission.obligationId &&
      candidate.revision === submission.revision - 1,
  );
}

/** Canonical form of what a milestone decision depends on: the answer and the exact files cited. */
function dependencyOf(
  data: ReviewData,
  submission: SubmissionRow,
  milestoneId: string,
) {
  const response = submission.answers.milestones[milestoneId];
  if (!response) return 'missing';
  const files = response.evidence
    .map((reference) => {
      const item = data.evidence.find(
        (candidate) => candidate.id === reference.evidenceId,
      );
      return `${reference.evidenceId}:${item?.sha256 ?? 'absent'}:${reference.passage}`;
    })
    .sort();
  return JSON.stringify({ ...response, evidence: files });
}

/**
 * Decision dependency rule (PRD §7.3, AT27): a changed answer, or a replaced or withdrawn file,
 * marks the milestone changed. A file shared by several milestones affects all of them.
 */
export function prior(data: ReviewData, submission: SubmissionRow) {
  const previous = previousSubmission(data, submission);
  if (!previous) return null;
  const changes: Record<string, 'changed' | 'unchanged'> = {};
  for (const milestone of milestonesOf(data, submission))
    changes[milestone.id] =
      dependencyOf(data, previous, milestone.id) ===
      dependencyOf(data, submission, milestone.id)
        ? 'unchanged'
        : 'changed';
  return {
    revision: previous.revision,
    decisions: activeDecisions(data, previous).map(toDecision),
    changes,
  };
}

export function queueItem(
  data: ReviewData,
  submission: SubmissionRow,
): ReviewQueueItem {
  const obligation = obligationOf(data, submission);
  const receipt = data.receipts.get(submission.receiptId)!;
  const decided = activeDecisions(data, submission);
  const earlier = prior(data, submission);
  const flags = [...data.views.get(obligation.id)!.flags];
  // Earlier decisions exist but this revision still needs them reviewed or confirmed (AT27).
  if (
    earlier &&
    earlier.decisions.length > 0 &&
    decided.length < milestonesOf(data, submission).length &&
    !submission.finalizedAt
  )
    flags.push('needs_re_review');
  return {
    submissionId: submission.id,
    obligationId: obligation.id,
    institutionId: obligation.institutionId,
    institutionName: receipt.institutionName,
    periodId: obligation.periodId,
    periodLabel: periodOf(data, obligation.periodId).label,
    revision: submission.revision,
    state: obligation.state,
    flags,
    receivedAt: receipt.receivedAt,
    firstSubmittedAt: obligation.firstSubmittedAt ?? receipt.receivedAt,
    decisionsRecorded: decided.length,
    decisionsRequired: milestonesOf(data, submission).length,
  };
}

/** The current revision of every submitted obligation in the loaded scope. */
export const currentSubmissions = (data: ReviewData) =>
  data.submissions.filter(
    (submission) =>
      obligationOf(data, submission).currentRevision === submission.revision,
  );

export async function reviewBundle(
  data: ReviewData,
  user: User,
  submission: SubmissionRow,
  db: Db,
): Promise<ReviewBundle> {
  const obligation = obligationOf(data, submission);
  const milestones = milestonesOf(data, submission);
  const decided = activeDecisions(data, submission);
  const current = obligation.currentRevision === submission.revision;
  const assigned =
    user.role === 'officer' &&
    (await assignedInstitutionIds(db, user.id)).includes(
      obligation.institutionId,
    );
  return {
    submissionId: submission.id,
    item: queueItem(data, submission),
    receipt: data.receipts.get(submission.receiptId)!,
    form: data.forms.find((form) => form.id === submission.formVersionId)!,
    milestones,
    answers: submission.answers,
    evidence: data.evidence
      .filter((item) => submission.evidenceIds.includes(item.id))
      .map(toEvidenceItem),
    suitability: data.suitability.filter((record) =>
      submission.evidenceIds.includes(record.evidenceId),
    ),
    comments: data.comments
      .filter((comment) => comment.obligationId === submission.obligationId)
      .map((comment) => ({
        id: comment.id,
        revision: comment.revision,
        author: comment.author,
        at: comment.at,
        text: comment.text,
        status: comment.status,
        addressedAt: comment.addressedAt,
        replies: comment.replies,
      })),
    decisions: decided.map(toDecision),
    score: scoreSummary(
      data.profile.weights.implementation,
      milestones,
      submission.answers,
      submission.evidenceIds,
      decided.map(toDecision),
      submission.revision,
      data.profile.name,
    ),
    finalizedAt: submission.finalizedAt,
    finalizedBy: submission.finalizedBy,
    canOverride:
      user.role === 'administrator' && !submission.finalizedAt && current,
    canDecide: assigned && !submission.finalizedAt && current,
    history: data.decisions
      .filter((decision) => decision.obligationId === obligation.id)
      .map(toDecision),
    prior: prior(data, submission),
    revisions: data.submissions
      .filter((candidate) => candidate.obligationId === obligation.id)
      .map((candidate) => ({
        revision: candidate.revision,
        submissionId: candidate.id,
        receiptId: candidate.receiptId,
        receivedAt: data.receipts.get(candidate.receiptId)!.receivedAt,
      })),
    clarifications: data.clarifications.filter(
      (clarification) => clarification.obligationId === obligation.id,
    ),
    reopenings: data.reopenings
      .filter((reopening) => reopening.obligationId === obligation.id)
      .map(({ reason, by, at }) => ({ reason, by, at })),
  };
}

/** Reviewed credit needs a cited file whose suitability checks found no deficiency (AT30). */
export function acceptBlocker(
  data: ReviewData,
  submission: SubmissionRow,
  milestoneId: string,
): { code: string; message: string } | null {
  const cited = (
    submission.answers.milestones[milestoneId]?.evidence ?? []
  ).map((reference) => reference.evidenceId);
  const name = (id: string) =>
    data.evidence.find((item) => item.id === id)?.fileName ?? id;
  const record = (id: string) =>
    data.suitability.find((candidate) => candidate.evidenceId === id);
  if (!cited.length)
    return {
      code: 'evidence_required',
      message:
        'Accepting needs a cited file. Reject with a reason, or ask for the file through a clarification.',
    };
  const unchecked = cited.filter((id) => !record(id));
  if (unchecked.length)
    return {
      code: 'suitability_required',
      message: `Record the suitability checks for ${unchecked.map(name).join(', ')} first.`,
    };
  if (cited.every((id) => record(id)!.deficient))
    return {
      code: 'evidence_deficient',
      message: `${cited.map(name).join(', ')} failed a suitability check, so it cannot support this claim. Reject with a reason, or ask for another file through a clarification.`,
    };
  return null;
}

/** FR15: submitted files within the loaded scope, filtered; nothing outside scope is counted. */
export function evidenceLookup(
  data: ReviewData,
  filter: {
    institutionId: string | null;
    periodId: string | null;
    category: string | null;
    reviewState: string | null;
  },
): EvidenceLookupItem[] {
  const items = currentSubmissions(data).flatMap((submission) => {
    const obligation = obligationOf(data, submission);
    const reviewState: EvidenceLookupItem['reviewState'] =
      obligation.state === 'finalized' ? 'finalized' : 'awaiting_review';
    if (
      filter.institutionId &&
      obligation.institutionId !== filter.institutionId
    )
      return [];
    if (filter.periodId && obligation.periodId !== filter.periodId) return [];
    if (filter.reviewState && reviewState !== filter.reviewState) return [];
    const institution = data.institutions.find(
      (candidate) => candidate.id === obligation.institutionId,
    )!;
    return data.evidence
      .filter(
        (item) =>
          submission.evidenceIds.includes(item.id) &&
          (!filter.category || item.category === filter.category),
      )
      .map((item) => {
        const record = data.suitability.find(
          (candidate) => candidate.evidenceId === item.id,
        );
        return {
          evidence: toEvidenceItem(item),
          institutionId: obligation.institutionId,
          institutionName: institution.name,
          periodId: obligation.periodId,
          periodLabel: periodOf(data, obligation.periodId).label,
          submissionId: submission.id,
          revision: submission.revision,
          reviewState,
          suitability: !record
            ? ('not_checked' as const)
            : record.deficient
              ? ('deficient' as const)
              : ('suitable' as const),
          citedBy: milestonesOf(data, submission)
            .filter((milestone) =>
              submission.answers.milestones[milestone.id]?.evidence.some(
                (reference) => reference.evidenceId === item.id,
              ),
            )
            .map((milestone) => milestone.code),
        };
      });
  });
  return items.sort(
    (a, b) =>
      a.institutionId.localeCompare(b.institutionId) ||
      a.periodId.localeCompare(b.periodId) ||
      a.evidence.fileName.localeCompare(b.evidence.fileName),
  );
}
