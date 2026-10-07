import type { DayCounting } from '../draft/index.js';
import { countDays, endOfDay, localDate, shiftDays } from './days.js';

/**
 * Business-time rules in Africa/Nairobi (UTC+03:00, no daylight saving), counted in calendar
 * or working days as the cycle's rule says (PRD §9.1, FR02).
 */
type Rule = Pick<DayCounting, 'mode' | 'holidays'>;

/** Counted days after the deadline date; at least 1 when late, 0 on time (§10.2). */
export function daysLate(submittedAt: string, deadline: string, rule: Rule) {
  if (Date.parse(submittedAt) <= Date.parse(deadline)) return 0;
  return Math.max(
    1,
    countDays(localDate(deadline), localDate(submittedAt), rule),
  );
}

/**
 * The response window from the later of portal availability and in-app notification: the
 * configured number of counted days after that event's local date, ending 23:59:59
 * Africa/Nairobi (PRD §7.3: seven calendar days by default; working days if enforced).
 */
export function responseDueAt(
  availableAt: string,
  notifiedAt: string,
  counting: Pick<DayCounting, 'mode' | 'holidays' | 'clarificationDays'>,
) {
  const start = Math.max(Date.parse(availableAt), Date.parse(notifiedAt));
  return endOfDay(
    shiftDays(localDate(start), counting.clarificationDays, counting),
  );
}

/** Whole elapsed days between two instants, never negative. */
export function wholeDays(from: string, to: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000),
  );
}

/**
 * Review queue timing (HP2-48), shared by the API and the mock. Open work waits on the officer
 * from receipt or the latest reopening, or on the institution while a clarification is open;
 * finalized work does not wait, and its case age stops at finalization.
 */
export function queueTiming(input: {
  receivedAt: string;
  firstSubmittedAt: string;
  finalizedAt: string | null;
  /** The latest reopening of this revision, if any. */
  reopenedAt: string | null;
  /** When the open clarification on this revision was requested, if one is open. */
  clarificationRequestedAt: string | null;
  now: string;
}) {
  const { finalizedAt, now } = input;
  if (finalizedAt)
    return {
      waiting: null,
      caseDays: wholeDays(input.firstSubmittedAt, finalizedAt),
    };
  const officerSince =
    input.reopenedAt &&
    Date.parse(input.reopenedAt) > Date.parse(input.receivedAt)
      ? input.reopenedAt
      : input.receivedAt;
  const waiting = input.clarificationRequestedAt
    ? {
        on: 'institution' as const,
        since: input.clarificationRequestedAt,
        days: wholeDays(input.clarificationRequestedAt, now),
      }
    : {
        on: 'officer' as const,
        since: officerSince,
        days: wholeDays(officerSince, now),
      };
  return { waiting, caseDays: wholeDays(input.firstSubmittedAt, now) };
}
