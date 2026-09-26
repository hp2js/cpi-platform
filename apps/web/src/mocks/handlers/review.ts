import { http, HttpResponse } from 'msw';
import {
  clarificationRequestSchema,
  decisionRequestSchema,
  finalizeRequestSchema,
  reopenRequestSchema,
  type Decision,
  type ReviewBundle,
  type ReviewQueueItem,
} from '@cpi/contracts';
import {
  commit,
  getDb,
  nextId,
  toEvidenceItem,
  type MockDb,
  type MockDecision,
  type MockSubmission,
} from '../db';
import {
  clarificationsFor,
  copyAnswers,
  dependencyChanges,
  responseDueAt,
} from '../services/clarifications';
import { audit, institutionUsers, notify } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { toObligation } from '../services/obligations';
import { baselineOf, periodOf } from '../services/reporting';
import { assignedInstitutionIds, canReadInstitution } from '../services/scope';
import { scoreSummary } from '../services/scoring';
import { requireRole } from '../services/session';
import type { MockUser } from '../seed/cast';

const obligationOf = (submission: MockSubmission) =>
  getDb().obligations.find(
    (obligation) => obligation.id === submission.obligationId,
  )!;
const milestonesOf = (submission: MockSubmission) => {
  const obligation = obligationOf(submission);
  return (
    baselineOf(obligation.institutionId, obligation.periodId)?.milestones ?? []
  );
};
const toDecision = (decision: MockDecision): Decision => ({
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
function activeDecisions(submission: MockSubmission) {
  return getDb().decisions.filter(
    (decision) =>
      decision.submissionId === submission.id && decision.supersededAt === null,
  );
}

function previousSubmission(submission: MockSubmission) {
  return getDb().submissions.find(
    (candidate) =>
      candidate.obligationId === submission.obligationId &&
      candidate.revision === submission.revision - 1,
  );
}

function prior(submission: MockSubmission) {
  const previous = previousSubmission(submission);
  if (!previous) return null;
  return {
    revision: previous.revision,
    decisions: activeDecisions(previous).map(toDecision),
    changes: dependencyChanges(
      previous,
      submission,
      milestonesOf(submission).map((milestone) => milestone.id),
    ),
  };
}

function queueItem(submission: MockSubmission): ReviewQueueItem {
  const db = getDb();
  const obligation = obligationOf(submission);
  const receipt = db.receipts.find(
    (candidate) => candidate.id === submission.receiptId,
  )!;
  const decided = activeDecisions(submission);
  const earlier = prior(submission);
  const flags = toObligation(obligation).flags;
  // Earlier decisions exist but this revision still needs them reviewed or confirmed (AT27).
  if (
    earlier &&
    earlier.decisions.length > 0 &&
    decided.length < milestonesOf(submission).length &&
    !submission.finalizedAt
  )
    flags.push('needs_re_review');
  return {
    submissionId: submission.id,
    obligationId: obligation.id,
    institutionId: obligation.institutionId,
    institutionName: receipt.institutionName,
    periodId: obligation.periodId,
    periodLabel: periodOf(obligation.periodId).label,
    revision: submission.revision,
    state: obligation.state,
    flags,
    receivedAt: receipt.receivedAt,
    firstSubmittedAt: obligation.firstSubmittedAt ?? receipt.receivedAt,
    decisionsRecorded: decided.length,
    decisionsRequired: milestonesOf(submission).length,
  };
}

function visibleSubmissions(user: MockUser) {
  return getDb().submissions.filter((submission) => {
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
      'Only the assigned officer can take review actions.',
      'forbidden',
    );
  }
}

/** Decisions must assess the latest revision; older work is refused, never overwritten (AT10). */
function requireCurrent(submission: MockSubmission, revision: number) {
  if (
    revision !== submission.revision ||
    obligationOf(submission).currentRevision !== submission.revision
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
      'This revision is finalized. Reopen it with a reason to change decisions.',
      'already_finalized',
    );
}

function reviewBundle(
  user: MockUser,
  submission: MockSubmission,
): ReviewBundle {
  const db = getDb();
  const obligation = obligationOf(submission);
  const milestones = milestonesOf(submission);
  const decisions = activeDecisions(submission);
  const form = db.forms.find(
    (candidate) => candidate.id === submission.formVersionId,
  )!;
  const revisions = db.submissions
    .filter((candidate) => candidate.obligationId === obligation.id)
    .map((candidate) => ({
      revision: candidate.revision,
      submissionId: candidate.id,
      receiptId: candidate.receiptId,
      receivedAt: db.receipts.find(
        (receipt) => receipt.id === candidate.receiptId,
      )!.receivedAt,
    }));
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
    decisions: decisions.map(toDecision),
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
    history: db.decisions
      .filter((decision) => decision.obligationId === obligation.id)
      .map(toDecision),
    prior: prior(submission),
    revisions,
    clarifications: clarificationsFor(obligation.id),
    reopenings: db.reopenings
      .filter((reopening) => reopening.obligationId === obligation.id)
      .map(({ reason, by, at }) => ({ reason, by, at })),
  };
}

/** Append a decision, superseding any active one for the same milestone and revision. */
function recordDecision(
  db: MockDb,
  user: MockUser,
  submission: MockSubmission,
  milestoneId: string,
  outcome: 'accepted' | 'rejected',
  reason: string,
  carriedForwardFrom: string | null,
) {
  for (const decision of db.decisions) {
    if (
      decision.submissionId === submission.id &&
      decision.milestoneId === milestoneId &&
      decision.supersededAt === null
    )
      decision.supersededAt = db.businessTime;
  }
  const decision: MockDecision = {
    id: nextId('dec'),
    submissionId: submission.id,
    obligationId: submission.obligationId,
    milestoneId,
    outcome,
    reason,
    revision: submission.revision,
    decidedBy: user.displayName,
    decidedAt: db.businessTime,
    carriedForwardFrom,
    supersededAt: null,
  };
  db.decisions.push(decision);
  const obligation = obligationOf(submission);
  if (obligation.state === 'submitted') obligation.state = 'under_review';
  audit(
    db,
    user,
    carriedForwardFrom ? 'decision.carry_forward' : 'decision.record',
    { type: 'decision', id: decision.id, version: submission.revision },
    `${milestoneId}: ${outcome}${carriedForwardFrom ? ` (confirmed from ${carriedForwardFrom})` : ''}`,
  );
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
      const milestone = milestonesOf(submission).find(
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
      commit((db) =>
        recordDecision(
          db,
          user,
          submission,
          milestone.id,
          parsed.data.outcome,
          parsed.data.reason.trim(),
          null,
        ),
      );
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),

  http.post(
    '/api/reviews/:submissionId/decisions/:milestoneCode/carry-forward',
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
          'The request is missing its revision.',
          'invalid_request',
        );
      requireCurrent(submission, parsed.data.revision);
      const milestone = milestonesOf(submission).find(
        (candidate) => candidate.code === params.milestoneCode,
      );
      const earlier = prior(submission);
      const previous = earlier?.decisions.find(
        (decision) => decision.milestoneId === milestone?.id,
      );
      if (!milestone || !earlier || !previous)
        return apiError(
          422,
          'There is no earlier decision to confirm.',
          'nothing_to_carry',
        );
      // Only unchanged dependencies may carry forward, and only by explicit confirmation (§7.3).
      if (earlier.changes[milestone.id] !== 'unchanged') {
        return apiError(
          409,
          'This milestone changed in the new revision. Review it and record a new decision.',
          'dependency_changed',
        );
      }
      commit((db) =>
        recordDecision(
          db,
          user,
          submission,
          milestone.id,
          previous.outcome,
          previous.reason,
          previous.id,
        ),
      );
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),

  http.post(
    '/api/reviews/:submissionId/clarifications',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const submission = findSubmission(user, params.submissionId);
      requireAssigned(user, submission);
      const parsed = clarificationRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) {
        return apiError(
          422,
          'Each clarification needs a question of at least 10 characters.',
          'invalid_clarification',
          {
            items:
              'Each clarification needs a question of at least 10 characters.',
          },
        );
      }
      requireCurrent(submission, parsed.data.revision);
      const obligation = obligationOf(submission);
      if (
        getDb().clarifications.some(
          (clarification) =>
            clarification.obligationId === obligation.id &&
            clarification.status === 'open',
        )
      ) {
        return apiError(
          409,
          'A clarification is already open for this report.',
          'clarification_open',
        );
      }
      const milestones = milestonesOf(submission);
      const items = parsed.data.items.map((item) => {
        const milestone = item.milestoneCode
          ? milestones.find(
              (candidate) => candidate.code === item.milestoneCode,
            )
          : undefined;
        return {
          milestoneId: milestone?.id ?? null,
          criterion: milestone
            ? `${milestone.code} ${milestone.title}`
            : 'Report as a whole',
          question: item.question.trim(),
          requestedEvidence: item.requestedEvidence.trim(),
        };
      });
      const period = periodOf(obligation.periodId);
      commit((db) => {
        const now = db.businessTime;
        const clarification = {
          id: nextId('clar'),
          submissionId: submission.id,
          obligationId: obligation.id,
          institutionId: obligation.institutionId,
          periodId: period.id,
          periodLabel: period.label,
          revision: submission.revision,
          items,
          requestedBy: user.displayName,
          requestedAt: now,
          // In-app notification is recorded in the same transaction, so both times are now.
          availableAt: now,
          notifiedAt: now,
          responseDueAt: responseDueAt(now, now),
          status: 'open' as const,
          response: null,
        };
        db.clarifications.push(clarification);
        obligation.state = 'clarification_requested';
        // The institution revises from its latest submission, preserving the earlier revision.
        db.drafts = db.drafts.filter(
          (draft) => draft.obligationId !== obligation.id,
        );
        db.drafts.push({
          obligationId: obligation.id,
          formVersionId: submission.formVersionId,
          answers: copyAnswers(submission.answers),
          version: 1,
          savedAt: null,
        });
        audit(
          db,
          user,
          'clarification.request',
          {
            type: 'clarification',
            id: clarification.id,
            version: submission.revision,
          },
          `${items.length} item(s) on ${period.label} revision ${submission.revision}`,
        );
        notify(
          db,
          clarification.id,
          'clarification.requested',
          institutionUsers(obligation.institutionId),
          {
            title: `Clarification requested on your ${period.label} report`,
            body: `Your reviewing officer has ${items.length} question${items.length === 1 ? '' : 's'}. Respond by submitting a revised report.`,
            link: `/institution/clarifications`,
          },
        );
      });
      return HttpResponse.json(reviewBundle(user, submission), { status: 201 });
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
      const obligation = obligationOf(submission);
      const baseline = baselineOf(
        obligation.institutionId,
        obligation.periodId,
      );
      if (baseline?.historicalSeed && !baseline.historicalSeed.confirmedAt) {
        return apiError(
          422,
          'Confirm that the seeded historical baseline matches the approved plan before finalizing.',
          'seed_unconfirmed',
        );
      }
      if (
        getDb().clarifications.some(
          (clarification) =>
            clarification.obligationId === obligation.id &&
            clarification.status === 'open',
        )
      ) {
        return apiError(
          409,
          'A clarification is open. Finalize after the institution responds.',
          'clarification_open',
        );
      }
      const decided = activeDecisions(submission);
      const undecided = milestonesOf(submission).filter(
        (milestone) =>
          !decided.some((decision) => decision.milestoneId === milestone.id),
      );
      if (undecided.length) {
        return apiError(
          422,
          `Record or confirm a decision for every milestone first: ${undecided.map((milestone) => milestone.code).join(', ')}.`,
          'decisions_incomplete',
        );
      }
      const period = periodOf(obligation.periodId);
      commit((db) => {
        submission.finalizedAt = db.businessTime;
        submission.finalizedBy = user.displayName;
        obligation.state = 'finalized';
        audit(
          db,
          user,
          'review.finalize',
          {
            type: 'submission',
            id: submission.id,
            version: submission.revision,
          },
          `${obligation.institutionId} ${period.label} revision ${submission.revision}`,
        );
        // The institution learns that review is complete, never the score (O06).
        notify(
          db,
          `${submission.id}:finalized:${db.sequence}`,
          'review.finalized',
          institutionUsers(obligation.institutionId),
          {
            title: `Review complete for your ${period.label} report`,
            body: 'Your reviewing officer has completed the review. Results are released after annual evaluation.',
            link: '/institution',
          },
        );
      });
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),

  http.post(
    '/api/reviews/:submissionId/reopen',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const submission = findSubmission(user, params.submissionId);
      requireAssigned(user, submission);
      const parsed = reopenRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      if (!submission.finalizedAt)
        return apiError(
          409,
          'Only a finalized review can be reopened.',
          'not_finalized',
        );
      if (obligationOf(submission).currentRevision !== submission.revision)
        return apiError(409, 'A newer revision exists.', 'version_conflict');
      const obligation = obligationOf(submission);
      const period = periodOf(obligation.periodId);
      // After publication, only an administrator-opened correction case allows a change (§7.4).
      const published = getDb().publications.some(
        (publication) =>
          publication.institutionId === obligation.institutionId &&
          publication.supersededBy === null,
      );
      const correction = getDb().corrections.find(
        (candidate) =>
          candidate.institutionId === obligation.institutionId &&
          candidate.closedAt === null,
      );
      if (published && correction?.periodId !== obligation.periodId) {
        return apiError(
          409,
          'This result is published. An administrator must open a correction case for this quarter first.',
          'correction_required',
        );
      }
      commit((db) => {
        db.reopenings.push({
          obligationId: obligation.id,
          submissionId: submission.id,
          reason: parsed.data.reason.trim(),
          by: user.displayName,
          at: db.businessTime,
        });
        submission.finalizedAt = null;
        submission.finalizedBy = null;
        obligation.state = 'under_review';
        audit(
          db,
          user,
          'review.reopen',
          {
            type: 'submission',
            id: submission.id,
            version: submission.revision,
          },
          parsed.data.reason.trim(),
        );
        notify(
          db,
          `${submission.id}:reopened:${db.sequence}`,
          'review.reopened',
          institutionUsers(obligation.institutionId),
          {
            title: `Review reopened for your ${period.label} report`,
            body: 'Your reviewing officer reopened the review. No action is needed unless you receive a clarification request.',
            link: '/institution',
          },
        );
      });
      return HttpResponse.json(reviewBundle(user, submission));
    },
  ),
];
