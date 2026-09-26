import { http, HttpResponse } from 'msw';
import {
  decisionRequestSchema,
  finalizeRequestSchema,
  type ReviewBundle,
  type ReviewQueueItem,
} from '@cpi/contracts';
import { commit, getDb, toEvidenceItem, type MockSubmission } from '../db';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { toObligation } from '../services/obligations';
import { baselineOf, periodOf } from '../services/reporting';
import { assignedInstitutionIds, canReadInstitution } from '../services/scope';
import { scoreSummary } from '../services/scoring';
import { requireRole } from '../services/session';
import type { MockUser } from '../seed/cast';

function obligationOf(submission: MockSubmission) {
  return getDb().obligations.find(
    (obligation) => obligation.id === submission.obligationId,
  )!;
}

function queueItem(submission: MockSubmission): ReviewQueueItem {
  const db = getDb();
  const obligation = obligationOf(submission);
  const receipt = db.receipts.find(
    (candidate) => candidate.id === submission.receiptId,
  )!;
  const milestones =
    baselineOf(obligation.institutionId, obligation.periodId)?.milestones ?? [];
  return {
    submissionId: submission.id,
    obligationId: obligation.id,
    institutionId: obligation.institutionId,
    institutionName: receipt.institutionName,
    periodId: obligation.periodId,
    periodLabel: periodOf(obligation.periodId).label,
    revision: submission.revision,
    state: obligation.state,
    flags: toObligation(obligation).flags,
    receivedAt: receipt.receivedAt,
    firstSubmittedAt: obligation.firstSubmittedAt ?? receipt.receivedAt,
    decisionsRecorded: db.decisions.filter(
      (decision) => decision.submissionId === submission.id,
    ).length,
    decisionsRequired: milestones.length,
  };
}

/** The current revision of each obligation, visible to the reviewer. */
function visibleSubmissions(user: MockUser) {
  const db = getDb();
  return db.submissions.filter((submission) => {
    const obligation = obligationOf(submission);
    return (
      obligation.currentRevision === submission.revision &&
      canReadInstitution(user, obligation.institutionId)
    );
  });
}

function findSubmission(user: MockUser, submissionId: unknown) {
  const submission = getDb().submissions.find(
    (candidate) => candidate.id === submissionId,
  );
  if (
    !submission ||
    !canReadInstitution(user, obligationOf(submission).institutionId)
  )
    throw notFound();
  return submission;
}

/** Only the currently assigned officer records decisions (PRD §5.2). */
function requireAssigned(user: MockUser, submission: MockSubmission) {
  if (
    user.role !== 'officer' ||
    !assignedInstitutionIds(user.id).includes(
      obligationOf(submission).institutionId,
    )
  ) {
    throw apiError(
      403,
      'Only the assigned officer can record review decisions.',
      'forbidden',
    );
  }
}

/** Decisions must assess the latest revision; older work is refused, never overwritten (AT10). */
function requireCurrent(submission: MockSubmission, revision: number) {
  const obligation = obligationOf(submission);
  if (
    revision !== submission.revision ||
    obligation.currentRevision !== submission.revision
  ) {
    throw apiError(
      409,
      'A newer revision has been submitted. Review the latest revision.',
      'version_conflict',
    );
  }
  if (submission.finalizedAt)
    throw apiError(
      409,
      'This revision is already finalized.',
      'already_finalized',
    );
}

function reviewBundle(
  user: MockUser,
  submission: MockSubmission,
): ReviewBundle {
  const db = getDb();
  const obligation = obligationOf(submission);
  const milestones =
    baselineOf(obligation.institutionId, obligation.periodId)?.milestones ?? [];
  const decisions = db.decisions.filter(
    (decision) => decision.submissionId === submission.id,
  );
  const form = db.forms.find(
    (candidate) => candidate.id === submission.formVersionId,
  )!;
  return {
    submissionId: submission.id,
    item: queueItem(submission),
    receipt: db.receipts.find(
      (receipt) => receipt.id === submission.receiptId,
    )!,
    form,
    milestones,
    answers: submission.answers,
    evidence: db.evidence
      .filter((item) => submission.evidenceIds.includes(item.id))
      .map(toEvidenceItem),
    decisions: decisions.map((decision) => ({
      milestoneId: decision.milestoneId,
      outcome: decision.outcome,
      reason: decision.reason,
      revision: decision.revision,
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
    })),
    score: scoreSummary(
      form.weights.implementation,
      milestones,
      submission.answers,
      submission.evidenceIds,
      decisions,
      submission.revision,
    ),
    finalizedAt: submission.finalizedAt,
    finalizedBy: submission.finalizedBy,
    canDecide:
      user.role === 'officer' &&
      assignedInstitutionIds(user.id).includes(obligation.institutionId) &&
      !submission.finalizedAt &&
      obligation.currentRevision === submission.revision,
  };
}

export const reviewHandlers = [
  http.get('/api/reviews', async ({ request }) => {
    await networkDelay();
    const user = requireRole('officer', 'supervisor', 'administrator');
    const status = new URL(request.url).searchParams.get('status') ?? 'open';
    const items = visibleSubmissions(user)
      .filter((submission) =>
        status === 'finalized'
          ? submission.finalizedAt !== null
          : submission.finalizedAt === null,
      )
      .map(queueItem)
      // Oldest unresolved work first (PRD §11).
      .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
    return HttpResponse.json(items);
  }),

  http.get('/api/reviews/:submissionId', async ({ params }) => {
    await networkDelay();
    const user = requireRole('officer', 'supervisor', 'administrator');
    return HttpResponse.json(
      reviewBundle(user, findSubmission(user, params.submissionId)),
    );
  }),

  http.put(
    '/api/reviews/:submissionId/decisions/:milestoneCode',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const submission = findSubmission(user, params.submissionId);
      requireAssigned(user, submission);
      const parsed = decisionRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(422, 'Choose accept or reject.', 'invalid_decision', {
          outcome: 'Choose accept or reject.',
        });
      requireCurrent(submission, parsed.data.revision);
      const obligation = obligationOf(submission);
      const milestone = baselineOf(
        obligation.institutionId,
        obligation.periodId,
      )?.milestones.find(
        (candidate) => candidate.code === params.milestoneCode,
      );
      if (!milestone) return notFound();
      if (
        parsed.data.outcome === 'rejected' &&
        parsed.data.reason.trim().length < 10
      ) {
        return apiError(
          422,
          'Explain the rejection so the institution can act on it.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      }
      const db = getDb();
      const decision = {
        submissionId: submission.id,
        milestoneId: milestone.id,
        outcome: parsed.data.outcome,
        reason: parsed.data.reason.trim(),
        revision: submission.revision,
        decidedBy: user.displayName,
        decidedAt: db.businessTime,
      };
      commit((store) => {
        store.decisions = store.decisions.filter(
          (candidate) =>
            !(
              candidate.submissionId === submission.id &&
              candidate.milestoneId === milestone.id
            ),
        );
        store.decisions.push(decision);
        if (obligation.state === 'submitted') obligation.state = 'under_review';
      });
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),

  http.post(
    '/api/reviews/:submissionId/finalize',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const submission = findSubmission(user, params.submissionId);
      requireAssigned(user, submission);
      const parsed = finalizeRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'The finalize request is missing its revision.',
          'invalid_request',
        );
      requireCurrent(submission, parsed.data.revision);
      const bundle = reviewBundle(user, submission);
      const undecided = bundle.milestones.filter(
        (milestone) =>
          !bundle.decisions.some(
            (decision) => decision.milestoneId === milestone.id,
          ),
      );
      if (undecided.length) {
        return apiError(
          422,
          `Record a decision for every milestone first: ${undecided.map((milestone) => milestone.code).join(', ')}.`,
          'decisions_incomplete',
        );
      }
      commit((db) => {
        submission.finalizedAt = db.businessTime;
        submission.finalizedBy = user.displayName;
        obligationOf(submission).state = 'finalized';
      });
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),
];
