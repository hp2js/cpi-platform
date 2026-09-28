import type { Obligation, ObligationFlag } from '@cpi/contracts';
import { getDb, type MockObligation } from '../db';
import { clarificationsFor } from './clarifications';
import { countDays, endOfDay, localDate, shiftDays } from './days';

/** Counted days (the cycle's rule) after the deadline date; at least 1 when late, 0 on time. */
export function daysLate(submittedAt: string, deadline: string) {
  if (Date.parse(submittedAt) <= Date.parse(deadline)) return 0;
  return Math.max(
    1,
    countDays(
      localDate(deadline),
      localDate(submittedAt),
      getDb().cycle.dayCounting,
    ),
  );
}

/** When a review of a report received at `receivedAt` passes the officer review target. */
export function reviewDueAt(receivedAt: string) {
  const { dayCounting } = getDb().cycle;
  return endOfDay(
    shiftDays(localDate(receivedAt), dayCounting.reviewTargetDays, dayCounting),
  );
}

/** Awaiting the officer's decision on the current revision beyond the review target. */
export function isReviewOverdue(obligation: MockObligation) {
  return (
    (obligation.state === 'submitted' || obligation.state === 'under_review') &&
    obligation.lastReceiptAt !== null &&
    Date.parse(getDb().businessTime) >
      Date.parse(reviewDueAt(obligation.lastReceiptAt))
  );
}

/**
 * Flags are derived from business time on the server, never in the browser (FR02). Officer
 * review timing is internal: institutions never see `review_overdue`.
 */
export function toObligation(
  obligation: MockObligation,
  audience: 'internal' | 'institution' = 'internal',
): Obligation {
  const { cycle, businessTime } = getDb();
  const period = cycle.periods.find(
    (candidate) => candidate.id === obligation.periodId,
  );
  if (!period) throw new Error(`Unknown period ${obligation.periodId}`);
  const now = Date.parse(businessTime);
  const periodEnd = Date.parse(`${period.endsOn}T23:59:59+03:00`);
  const deadline = Date.parse(period.submissionDeadline);
  const flags: ObligationFlag[] = [];
  if (now <= periodEnd) flags.push('not_yet_due');
  const submittedAt = obligation.firstSubmittedAt
    ? Date.parse(obligation.firstSubmittedAt)
    : undefined;
  // A closed quarter has a disposition, not a lateness flag.
  if (
    obligation.state !== 'closed_without_submission' &&
    (submittedAt !== undefined ? submittedAt > deadline : now > deadline)
  )
    flags.push('late');
  if (
    clarificationsFor(obligation.id).some(
      (clarification) => clarification.overdue,
    )
  )
    flags.push('clarification_overdue');
  if (audience === 'internal' && isReviewOverdue(obligation))
    flags.push('review_overdue');
  return {
    ...obligation,
    flags,
    daysLate: obligation.firstSubmittedAt
      ? daysLate(obligation.firstSubmittedAt, period.submissionDeadline)
      : null,
    daysLateUnit: getDb().cycle.dayCounting.mode,
  };
}
