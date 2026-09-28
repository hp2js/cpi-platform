import { and, eq, inArray, lt } from 'drizzle-orm';
import {
  daysLate,
  type DayCounting,
  type Obligation,
  type ObligationFlag,
} from '@cpi/contracts';
import { endOfDay, localDate, shiftDays } from '../cycle/days';
import type { Db } from '../database/db';
import { clarifications, obligations, periods } from '../database/schema';
import { currentState } from '../database/state';

type ObligationRow = typeof obligations.$inferSelect;

/** When a review of a report received at `receivedAt` passes the officer review target. */
export function reviewDueAt(receivedAt: string, dayCounting: DayCounting) {
  return endOfDay(
    shiftDays(localDate(receivedAt), dayCounting.reviewTargetDays, dayCounting),
  );
}

/** Awaiting the officer's decision on the current revision beyond the review target (PRD §7.3). */
export function isReviewOverdue(
  obligation: ObligationRow,
  businessTime: string,
  dayCounting: DayCounting,
) {
  return (
    (obligation.state === 'submitted' || obligation.state === 'under_review') &&
    obligation.lastReceiptAt !== null &&
    Date.parse(businessTime) >
      Date.parse(reviewDueAt(obligation.lastReceiptAt, dayCounting))
  );
}

/** Flags are derived from business time on the server, never in the browser (FR02). */
export async function toObligations(
  db: Db,
  rows: ObligationRow[],
  audience: 'internal' | 'institution' = 'internal',
): Promise<Obligation[]> {
  if (rows.length === 0) return [];
  const { state, cycle } = await currentState(db);
  const now = Date.parse(state.businessTime);
  const periodById = new Map(
    (await db.select().from(periods)).map((period) => [period.id, period]),
  );
  const overdue = new Set(
    (
      await db
        .select({ obligationId: clarifications.obligationId })
        .from(clarifications)
        .where(
          and(
            inArray(
              clarifications.obligationId,
              rows.map((row) => row.id),
            ),
            eq(clarifications.status, 'open'),
            lt(clarifications.responseDueAt, state.businessTime),
          ),
        )
    ).map((row) => row.obligationId),
  );
  return rows.map((row) => {
    const period = periodById.get(row.periodId);
    if (!period) throw new Error(`Unknown period ${row.periodId}`);
    const periodEnd = Date.parse(`${period.endsOn}T23:59:59+03:00`);
    const deadline = Date.parse(period.submissionDeadline);
    const flags: ObligationFlag[] = [];
    if (now <= periodEnd) flags.push('not_yet_due');
    const submittedAt = row.firstSubmittedAt
      ? Date.parse(row.firstSubmittedAt)
      : undefined;
    // A closed quarter has a disposition, not a lateness flag.
    if (
      row.state !== 'closed_without_submission' &&
      (submittedAt !== undefined ? submittedAt > deadline : now > deadline)
    )
      flags.push('late');
    if (overdue.has(row.id)) flags.push('clarification_overdue');
    // Officer review timing is internal: institutions never see `review_overdue`.
    if (
      audience === 'internal' &&
      isReviewOverdue(row, state.businessTime, cycle.dayCounting)
    )
      flags.push('review_overdue');
    return {
      ...row,
      flags,
      daysLate: row.firstSubmittedAt
        ? daysLate(row.firstSubmittedAt, period.submissionDeadline)
        : null,
      // ponytail: calendar days only; working-day counting (PRD §9.1) is a follow-up.
      daysLateUnit: 'calendar' as const,
    };
  });
}
