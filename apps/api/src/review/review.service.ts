import { Inject, Injectable } from '@nestjs/common';
import {
  clarificationRequestSchema,
  closeClarificationRequestSchema,
  decisionRequestSchema,
  finalizeRequestSchema,
  oversightCommentRequestSchema,
  oversightReplyRequestSchema,
  reopenRequestSchema,
  responseDueAt,
  suitabilityCheckKeys,
  suitabilityRequestSchema,
  type EvidenceLookupItem,
  type ReviewBundle,
  type ReviewQueueItem,
} from '@cpi/contracts';
import { assignedInstitutionIds, readableInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import { currentState } from '../database/state';
import {
  Events,
  assignedOfficers,
  assignedSupervisors,
  institutionUsers,
} from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { effectiveCutoff } from './clarifications';
import {
  acceptBlocker,
  activeDecisions,
  baselineOf,
  currentSubmissions,
  evidenceLookup,
  loadReviewData,
  milestonesOf,
  obligationOf,
  periodOf,
  prior,
  queueItem,
  reviewBundle,
  type ReviewData,
  type SubmissionRow,
} from './data';
import { ReviewRepository } from './review.repository';

/** An administrator's `X-Override-Reason` and the action it is for (`decisions/M1`, `finalize`). */
export type ReviewOverride = { reason: string | undefined; action: string };
export type EvidenceFilters = Record<string, string | undefined>;

/** Decisions must assess the latest revision; older work is refused, never overwritten (AT10). */
function requireCurrent(
  data: ReviewData,
  submission: SubmissionRow,
  revision: number,
) {
  if (
    revision !== submission.revision ||
    obligationOf(data, submission).currentRevision !== submission.revision
  )
    throw new ApiError(
      409,
      'A newer revision has been submitted. Review the latest revision.',
      'version_conflict',
    );
  if (submission.finalizedAt)
    throw new ApiError(
      409,
      'This revision is finalized. Reopen it with a reason to change decisions.',
      'already_finalized',
    );
}

const reasonRequired = () =>
  new ApiError(
    422,
    'Give a reason of at least 10 characters.',
    'reason_required',
    { reason: 'Give a reason of at least 10 characters.' },
  );

/**
 * The officer review workflow (PRD §7.3, FR08–FR10, FR15). Request bodies are validated after
 * scope and assignment checks, so 404 and 403 take precedence over 422.
 */
@Injectable()
export class ReviewService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: ReviewRepository,
    private readonly events: Events,
  ) {}

  /** The submission and its institution's review records; 404 outside the caller's scope. */
  private async load(db: Db, user: User, submissionId: string) {
    const institutionId = await this.repository.submissionInstitution(
      submissionId,
      db,
    );
    if (
      !institutionId ||
      !(await readableInstitutionIds(db, user)).includes(institutionId)
    )
      throw notFound();
    const data = await loadReviewData(db, [institutionId]);
    const submission = data.submissions.find(
      (candidate) => candidate.id === submissionId,
    )!;
    return { data, submission, obligation: obligationOf(data, submission) };
  }

  /**
   * Review actions belong to the assigned officer. An administrator may act only through a
   * distinct, justified override (FR10, PRD §5.2); every use is recorded in the audit log.
   */
  private async requireAssigned(
    tx: Tx,
    businessTime: string,
    user: User,
    submission: SubmissionRow,
    institutionId: string,
    override: ReviewOverride,
  ) {
    if (
      user.role === 'officer' &&
      (await assignedInstitutionIds(tx, user.id)).includes(institutionId)
    )
      return;
    const justification = override.reason;
    if (user.role === 'administrator' && justification) {
      if (justification.length < 20)
        throw new ApiError(
          422,
          'An override needs a justification of at least 20 characters.',
          'override_reason_required',
        );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'review.override',
        { type: 'submission', id: submission.id, version: submission.revision },
        `${override.action}: ${justification}`,
      );
      return;
    }
    throw new ApiError(
      403,
      user.role === 'administrator'
        ? 'Administrators act on reviews only through a justified override.'
        : 'Only the assigned officer can take review actions.',
      'forbidden',
    );
  }

  /** Load, check scope and assignment, run the change, and return the fresh review bundle. */
  private act(
    user: User,
    submissionId: string,
    override: ReviewOverride,
    change: (
      tx: Tx,
      businessTime: string,
      context: Awaited<ReturnType<ReviewService['load']>>,
    ) => Promise<void>,
  ): Promise<ReviewBundle> {
    return write(this.db, async (tx, businessTime) => {
      const context = await this.load(tx, user, submissionId);
      await this.requireAssigned(
        tx,
        businessTime,
        user,
        context.submission,
        context.obligation.institutionId,
        override,
      );
      await change(tx, businessTime, context);
      const fresh = await this.load(tx, user, submissionId);
      return reviewBundle(fresh.data, user, fresh.submission, tx);
    });
  }

  /** Append a decision, superseding any active one for the same milestone and revision. */
  private async recordDecision(
    tx: Tx,
    businessTime: string,
    user: User,
    submission: SubmissionRow,
    state: string,
    milestoneId: string,
    outcome: 'accepted' | 'rejected',
    reason: string,
    carriedForwardFrom: string | null,
  ) {
    const id = await nextId(tx, 'dec');
    await this.repository.replaceDecision(
      {
        id,
        submissionId: submission.id,
        obligationId: submission.obligationId,
        milestoneId,
        outcome,
        reason,
        revision: submission.revision,
        decidedBy: user.displayName,
        decidedAt: businessTime,
        carriedForwardFrom,
        supersededAt: null,
      },
      tx,
    );
    if (state === 'submitted')
      await this.repository.setObligationState(
        submission.obligationId,
        'under_review',
        tx,
      );
    await this.events.audit(
      tx,
      businessTime,
      user,
      carriedForwardFrom ? 'decision.carry_forward' : 'decision.record',
      { type: 'decision', id, version: submission.revision },
      `${milestoneId}: ${outcome}${carriedForwardFrom ? ` (confirmed from ${carriedForwardFrom})` : ''}`,
    );
  }

  // FR15: scoped lookup only; out-of-scope files never appear in results or counts.
  async evidence(
    user: User,
    query: EvidenceFilters,
  ): Promise<EvidenceLookupItem[]> {
    const data = await loadReviewData(
      this.db,
      await readableInstitutionIds(this.db, user),
    );
    return evidenceLookup(data, {
      institutionId: query.institutionId || null,
      periodId: query.periodId || null,
      category: query.category || null,
      reviewState: query.reviewState || null,
    });
  }

  async queue(user: User, status = 'open'): Promise<ReviewQueueItem[]> {
    const data = await loadReviewData(
      this.db,
      await readableInstitutionIds(this.db, user),
    );
    return (
      currentSubmissions(data)
        .filter((submission) =>
          status === 'finalized'
            ? submission.finalizedAt !== null
            : submission.finalizedAt === null,
        )
        .map((submission) => queueItem(data, submission))
        // Oldest unresolved work first (PRD §11).
        .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
    );
  }

  async bundle(user: User, id: string): Promise<ReviewBundle> {
    const { data, submission } = await this.load(this.db, user, id);
    return reviewBundle(data, user, submission, this.db);
  }

  decide(
    user: User,
    id: string,
    code: string,
    body: unknown,
    override: ReviewOverride,
  ) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission, obligation } = context;
      const parsed = decisionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose accept or reject.',
          'invalid_decision',
          {
            outcome: 'Choose accept or reject.',
          },
        );
      requireCurrent(data, submission, parsed.data.revision);
      const milestone = milestonesOf(data, submission).find(
        (candidate) => candidate.code === code,
      );
      if (!milestone) throw notFound();
      if (
        parsed.data.outcome === 'rejected' &&
        parsed.data.reason.trim().length < 10
      )
        throw new ApiError(
          422,
          'Explain the rejection so the institution can act on it.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      if (parsed.data.outcome === 'accepted') {
        const blocker = acceptBlocker(data, submission, milestone.id);
        if (blocker) throw new ApiError(422, blocker.message, blocker.code);
      }
      await this.recordDecision(
        tx,
        businessTime,
        user,
        submission,
        obligation.state,
        milestone.id,
        parsed.data.outcome,
        parsed.data.reason.trim(),
        null,
      );
    });
  }

  suitability(
    user: User,
    id: string,
    evidenceId: string,
    body: unknown,
    override: ReviewOverride,
  ) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission } = context;
      const parsed = suitabilityRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Each check needs an outcome, and a reason when it does not pass.',
          'invalid_suitability',
          Object.fromEntries(
            parsed.error.issues.map((issue) => [
              issue.path.join('.'),
              issue.message,
            ]),
          ),
        );
      requireCurrent(data, submission, parsed.data.revision);
      if (!submission.evidenceIds.includes(evidenceId)) throw notFound();
      const deficient = suitabilityCheckKeys.some(
        (key) => parsed.data.checks[key].outcome === 'deficient',
      );
      if (deficient) {
        // An accepted claim cannot silently lose its only suitable file.
        const affected = activeDecisions(data, submission).filter(
          (decision) => {
            if (decision.outcome !== 'accepted') return false;
            const cited = (
              submission.answers.milestones[decision.milestoneId]?.evidence ??
              []
            ).map((reference) => reference.evidenceId);
            return (
              cited.includes(evidenceId) &&
              cited.every(
                (other) =>
                  other === evidenceId ||
                  data.suitability.find((record) => record.evidenceId === other)
                    ?.deficient !== false,
              )
            );
          },
        );
        if (affected.length) {
          const codes = affected.map(
            (decision) =>
              milestonesOf(data, submission).find(
                (milestone) => milestone.id === decision.milestoneId,
              )?.code ?? decision.milestoneId,
          );
          throw new ApiError(
            409,
            `${codes.join(', ')} ${codes.length === 1 ? 'is' : 'are'} accepted on this file. Change ${codes.length === 1 ? 'that decision' : 'those decisions'} first.`,
            'decision_depends',
          );
        }
      }
      const record = {
        evidenceId,
        checks: parsed.data.checks,
        deficient,
        recordedBy: user.displayName,
        recordedAt: businessTime,
      };
      await this.repository.saveSuitability(record, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'evidence.suitability',
        { type: 'evidence', id: evidenceId },
        deficient
          ? `Deficient: ${suitabilityCheckKeys
              .filter((key) => parsed.data.checks[key].outcome === 'deficient')
              .map((key) => `${key} (${parsed.data.checks[key].reason})`)
              .join('; ')}`
          : 'All checks pass or not applicable',
      );
    });
  }

  closeClarification(
    user: User,
    id: string,
    clarificationId: string,
    body: unknown,
    override: ReviewOverride,
  ) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, obligation } = context;
      const parsed = closeClarificationRequestSchema.safeParse(body);
      if (!parsed.success) throw reasonRequired();
      const clarification = data.clarifications.find(
        (candidate) =>
          candidate.id === clarificationId &&
          candidate.obligationId === obligation.id,
      );
      if (!clarification) throw notFound();
      if (clarification.status !== 'open')
        throw new ApiError(
          409,
          'This clarification is not open.',
          'clarification_not_open',
        );
      const now = Date.parse(businessTime);
      // Only after both the response window and the applicable cutoff (§7.3, AT29).
      if (
        now <= Date.parse(clarification.responseDueAt) ||
        now <= (await effectiveCutoff(tx, obligation.institutionId))
      )
        throw new ApiError(
          409,
          'An unanswered clarification can be closed only after its response window and the evaluation cutoff (or an authorized extension) have both passed.',
          'window_open',
        );
      await this.repository.closeClarification(
        clarification.id,
        { reason: parsed.data.reason, by: user.displayName, at: businessTime },
        tx,
      );
      await this.repository.setObligationState(
        obligation.id,
        'under_review',
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'clarification.close_unanswered',
        { type: 'clarification', id: clarification.id },
        parsed.data.reason,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${clarification.id}:closed`,
        'clarification.closed',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `${periodOf(data, obligation.periodId).label} clarification closed unanswered`,
          body: `The response window and the evaluation cutoff have passed. Reason: ${parsed.data.reason}`,
          link: '/institution/clarifications',
        },
      );
    });
  }

  /** Oversight comments are guidance for the officer, never an approval gate (PRD §5.2, §7.3). */
  comment(user: User, id: string, body: unknown): Promise<ReviewBundle> {
    return write(this.db, async (tx, businessTime) => {
      const { data, submission, obligation } = await this.load(tx, user, id);
      const parsed = oversightCommentRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Write at least 10 characters.',
          'invalid_comment',
          { text: 'Write at least 10 characters.' },
        );
      const commentId = await nextId(tx, 'cmt');
      await this.repository.insertComment(
        {
          id: commentId,
          obligationId: obligation.id,
          revision: submission.revision,
          author: user.displayName,
          at: businessTime,
          text: parsed.data.text,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'review.comment',
        { type: 'submission', id: submission.id, version: submission.revision },
        `Oversight comment on ${obligation.id}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${commentId}:comment`,
        'review.comment',
        await assignedOfficers(tx, obligation.institutionId),
        {
          title: `Supervisor comment on ${obligation.institutionId} ${periodOf(data, obligation.periodId).label}`,
          body: 'The supervisor left an oversight comment. It is guidance, not an approval step.',
          link: `/officer/reviews/${submission.id}`,
        },
      );
      const fresh = await this.load(tx, user, id);
      return reviewBundle(fresh.data, user, fresh.submission, tx);
    });
  }

  /** A reply in an oversight comment's thread; the assigned officer may mark it addressed. */
  reply(
    user: User,
    id: string,
    commentId: string,
    body: unknown,
  ): Promise<ReviewBundle> {
    return write(this.db, async (tx, businessTime) => {
      const { data, submission, obligation } = await this.load(tx, user, id);
      if (
        user.role === 'officer' &&
        !(await assignedInstitutionIds(tx, user.id)).includes(
          obligation.institutionId,
        )
      )
        throw new ApiError(
          403,
          'Only the assigned officer can reply to oversight comments.',
          'forbidden',
        );
      const parsed = oversightReplyRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(422, 'Write a reply.', 'invalid_reply', {
          text: 'Write a reply.',
        });
      if (parsed.data.addressed && user.role !== 'officer')
        throw new ApiError(
          422,
          'Only the officer marks a comment addressed.',
          'invalid_reply',
        );
      const comment = data.comments.find(
        (candidate) =>
          candidate.id === commentId &&
          candidate.obligationId === submission.obligationId,
      );
      if (!comment) throw notFound();
      const replies = [
        ...comment.replies,
        {
          author: user.displayName,
          role: user.role as 'officer' | 'supervisor',
          at: businessTime,
          text: parsed.data.text,
        },
      ];
      const addressing = parsed.data.addressed && comment.status === 'open';
      await this.repository.updateComment(
        comment.id,
        {
          replies,
          ...(addressing
            ? { status: 'addressed' as const, addressedAt: businessTime }
            : {}),
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        parsed.data.addressed
          ? 'review.comment_addressed'
          : 'review.comment_reply',
        { type: 'submission', id: submission.id, version: submission.revision },
        `Reply on oversight comment ${comment.id}`,
      );
      const period = periodOf(data, obligation.periodId).label;
      const key = `${comment.id}:reply:${replies.length}`;
      if (user.role === 'officer')
        await this.events.notify(
          tx,
          businessTime,
          key,
          'review.comment_reply',
          await assignedSupervisors(tx, obligation.institutionId),
          {
            title: `${parsed.data.addressed ? 'Comment addressed' : 'Officer replied'}: ${obligation.institutionId} ${period}`,
            body: parsed.data.text,
            link: `/supervisor/reviews/${submission.id}`,
          },
        );
      else
        await this.events.notify(
          tx,
          businessTime,
          key,
          'review.comment_reply',
          await assignedOfficers(tx, obligation.institutionId),
          {
            title: `Supervisor replied: ${obligation.institutionId} ${period}`,
            body: 'The supervisor added to an oversight comment. It is guidance, not an approval step.',
            link: `/officer/reviews/${submission.id}`,
          },
        );
      const fresh = await this.load(tx, user, id);
      return reviewBundle(fresh.data, user, fresh.submission, tx);
    });
  }

  carryForward(
    user: User,
    id: string,
    code: string,
    body: unknown,
    override: ReviewOverride,
  ) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission, obligation } = context;
      const parsed = finalizeRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'The request is missing its revision.',
          'invalid_request',
        );
      requireCurrent(data, submission, parsed.data.revision);
      const milestone = milestonesOf(data, submission).find(
        (candidate) => candidate.code === code,
      );
      const earlier = prior(data, submission);
      const previous = earlier?.decisions.find(
        (decision) => decision.milestoneId === milestone?.id,
      );
      if (!milestone || !earlier || !previous)
        throw new ApiError(
          422,
          'There is no earlier decision to confirm.',
          'nothing_to_carry',
        );
      // Only unchanged dependencies may carry forward, and only by explicit confirmation (§7.3).
      if (earlier.changes[milestone.id] !== 'unchanged')
        throw new ApiError(
          409,
          'This milestone changed in the new revision. Review it and record a new decision.',
          'dependency_changed',
        );
      await this.recordDecision(
        tx,
        businessTime,
        user,
        submission,
        obligation.state,
        milestone.id,
        previous.outcome,
        previous.reason,
        previous.id,
      );
    });
  }

  requestClarification(
    user: User,
    id: string,
    body: unknown,
    override: ReviewOverride,
  ) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission, obligation } = context;
      const parsed = clarificationRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Each clarification needs a question of at least 10 characters.',
          'invalid_clarification',
          {
            items:
              'Each clarification needs a question of at least 10 characters.',
          },
        );
      requireCurrent(data, submission, parsed.data.revision);
      if (
        data.clarifications.some(
          (clarification) =>
            clarification.obligationId === obligation.id &&
            clarification.status === 'open',
        )
      )
        throw new ApiError(
          409,
          'A clarification is already open for this report.',
          'clarification_open',
        );
      const milestones = milestonesOf(data, submission);
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
      const period = periodOf(data, obligation.periodId);
      const counting = (await currentState(tx)).cycle.dayCounting;
      const clarificationId = await nextId(tx, 'clar');
      await this.repository.insertClarification(
        {
          id: clarificationId,
          submissionId: submission.id,
          obligationId: obligation.id,
          institutionId: obligation.institutionId,
          periodId: period.id,
          revision: submission.revision,
          items,
          requestedBy: user.displayName,
          requestedAt: businessTime,
          // In-app notification is recorded in the same transaction, so both times are now.
          availableAt: businessTime,
          notifiedAt: businessTime,
          responseDueAt: responseDueAt(businessTime, businessTime, counting),
          // The window as issued; a later change to the rule never shortens it.
          windowDays: counting.clarificationDays,
          windowUnit: counting.mode,
          status: 'open',
          response: null,
          closure: null,
        },
        tx,
      );
      await this.repository.setObligationState(
        obligation.id,
        'clarification_requested',
        tx,
      );
      // The institution revises from its latest submission, preserving the earlier revision.
      const draft = {
        obligationId: obligation.id,
        formVersionId: submission.formVersionId,
        answers: submission.answers,
        version: 1,
        savedAt: null,
        savedBy: null,
      };
      await this.repository.saveDraft(draft, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'clarification.request',
        {
          type: 'clarification',
          id: clarificationId,
          version: submission.revision,
        },
        `${items.length} item(s) on ${period.label} revision ${submission.revision}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        clarificationId,
        'clarification.requested',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `Clarification requested on your ${period.label} report`,
          body: `Your reviewing officer has ${items.length} question${items.length === 1 ? '' : 's'}. Respond by submitting a revised report.`,
          link: '/institution/clarifications',
        },
      );
    });
  }

  finalize(user: User, id: string, body: unknown, override: ReviewOverride) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission, obligation } = context;
      const parsed = finalizeRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'The finalize request is missing its revision.',
          'invalid_request',
        );
      requireCurrent(data, submission, parsed.data.revision);
      const baseline = baselineOf(
        data,
        obligation.institutionId,
        obligation.periodId,
      );
      if (baseline?.historicalSeed && !baseline.historicalSeed.confirmedAt)
        throw new ApiError(
          422,
          'Confirm that the seeded historical baseline matches the approved plan before finalizing.',
          'seed_unconfirmed',
        );
      if (
        data.clarifications.some(
          (clarification) =>
            clarification.obligationId === obligation.id &&
            clarification.status === 'open',
        )
      )
        throw new ApiError(
          409,
          'A clarification is open. Finalize after the institution responds.',
          'clarification_open',
        );
      const decided = activeDecisions(data, submission);
      const undecided = milestonesOf(data, submission).filter(
        (milestone) =>
          !decided.some((decision) => decision.milestoneId === milestone.id),
      );
      if (undecided.length)
        throw new ApiError(
          422,
          `Record or confirm a decision for every milestone first: ${undecided.map((milestone) => milestone.code).join(', ')}.`,
          'decisions_incomplete',
        );
      const period = periodOf(data, obligation.periodId);
      await this.repository.updateSubmission(
        submission.id,
        { finalizedAt: businessTime, finalizedBy: user.displayName },
        tx,
      );
      await this.repository.setObligationState(obligation.id, 'finalized', tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'review.finalize',
        { type: 'submission', id: submission.id, version: submission.revision },
        `${obligation.institutionId} ${period.label} revision ${submission.revision}`,
      );
      // The institution learns that review is complete, never the score (O06).
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${submission.id}:finalized`),
        'review.finalized',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `Review complete for your ${period.label} report`,
          body: 'Your reviewing officer has completed the review. Results are released after annual evaluation.',
          link: '/institution',
        },
      );
    });
  }

  reopen(user: User, id: string, body: unknown, override: ReviewOverride) {
    return this.act(user, id, override, async (tx, businessTime, context) => {
      const { data, submission, obligation } = context;
      const parsed = reopenRequestSchema.safeParse(body);
      if (!parsed.success) throw reasonRequired();
      if (!submission.finalizedAt)
        throw new ApiError(
          409,
          'Only a finalized review can be reopened.',
          'not_finalized',
        );
      if (obligation.currentRevision !== submission.revision)
        throw new ApiError(409, 'A newer revision exists.', 'version_conflict');
      const period = periodOf(data, obligation.periodId);
      // After publication, only an administrator-opened correction case allows a change (§7.4).
      const published = data.publications.some(
        (publication) =>
          publication.institutionId === obligation.institutionId &&
          publication.supersededBy === null,
      );
      const correction = data.corrections.find(
        (candidate) =>
          candidate.institutionId === obligation.institutionId &&
          candidate.closedAt === null,
      );
      if (published && correction?.periodId !== obligation.periodId)
        throw new ApiError(
          409,
          'This result is published. An administrator must open a correction case for this quarter first.',
          'correction_required',
        );
      await this.repository.insertReopening(
        {
          obligationId: obligation.id,
          submissionId: submission.id,
          reason: parsed.data.reason.trim(),
          by: user.displayName,
          at: businessTime,
        },
        tx,
      );
      await this.repository.updateSubmission(
        submission.id,
        { finalizedAt: null, finalizedBy: null },
        tx,
      );
      await this.repository.setObligationState(
        obligation.id,
        'under_review',
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'review.reopen',
        { type: 'submission', id: submission.id, version: submission.revision },
        parsed.data.reason.trim(),
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${submission.id}:reopened`),
        'review.reopened',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `Review reopened for your ${period.label} report`,
          body: 'Your reviewing officer reopened the review. No action is needed unless you receive a clarification request.',
          link: '/institution',
        },
      );
    });
  }
}
