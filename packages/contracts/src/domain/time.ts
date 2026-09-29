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
