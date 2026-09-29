import type { DayCounting } from '../draft/index.js';

/**
 * Day counting in Africa/Nairobi (UTC+03:00, no DST). Calendar mode counts every day; working
 * mode counts Monday to Friday, skipping the configured public holidays. All inputs and outputs
 * are local calendar dates (YYYY-MM-DD) unless named otherwise.
 */

const DAY = 86_400_000;
const EAT_OFFSET_MS = 3 * 3_600_000;

type Rule = Pick<DayCounting, 'mode' | 'holidays'>;

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Nairobi calendar date of an instant. */
export function localDate(instant: string | number) {
  const ms = typeof instant === 'number' ? instant : Date.parse(instant);
  return toDate(ms + EAT_OFFSET_MS);
}

export const endOfDay = (date: string) => `${date}T23:59:59+03:00`;

export function isWorkingDay(date: string, rule: Rule) {
  const weekday = new Date(toMs(date)).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !rule.holidays.some((holiday) => holiday.date === date);
}

/** The date `days` counted days after `date` (forward) or before it (negative). */
export function shiftDays(date: string, days: number, rule: Rule) {
  if (rule.mode === 'calendar') return toDate(toMs(date) + days * DAY);
  const step = days < 0 ? -1 : 1;
  let ms = toMs(date);
  let remaining = Math.abs(days);
  while (remaining > 0) {
    ms += step * DAY;
    if (isWorkingDay(toDate(ms), rule)) remaining -= 1;
  }
  return toDate(ms);
}

/** Counted days in (from, to]: 0 when `to` is not after `from`. */
export function countDays(from: string, to: string, rule: Rule) {
  if (to <= from) return 0;
  if (rule.mode === 'calendar')
    return Math.round((toMs(to) - toMs(from)) / DAY);
  let count = 0;
  for (let ms = toMs(from) + DAY; ms <= toMs(to); ms += DAY)
    if (isWorkingDay(toDate(ms), rule)) count += 1;
  return count;
}
