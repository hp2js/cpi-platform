/**
 * Business dates are always shown in Africa/Nairobi time with an explicit "EAT" suffix,
 * so deadlines are unambiguous regardless of the viewer's device timezone (PRD §11).
 */
const TIMEZONE = 'Africa/Nairobi';

/** Fixed abbreviations: ICU versions disagree on e.g. "Sep" vs "Sept". */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** e.g. "Thu 15 Oct 2026, 23:59 EAT". Built from parts so punctuation is stable across ICU versions. */
export function formatDateTime(instant: string) {
  const parts = Object.fromEntries(
    dateTime
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}, ${parts.hour}:${parts.minute} EAT`;
}

/** Day, month and time only, for tight spaces (the phone simulation bar): `1 Oct, 08:00`. */
export function formatShortDateTime(instant: string) {
  const parts = Object.fromEntries(
    dateTime
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]}, ${parts.hour}:${parts.minute}`;
}

/** Calendar dates (YYYY-MM-DD) carry no time, so they are formatted without shifting. */
export function formatCalendarDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

export function formatDateRange(start: string, end: string) {
  return `${formatCalendarDate(start)} – ${formatCalendarDate(end)}`;
}

/** "3 days" or "3 working days", following the cycle's day-counting rule. */
export function formatDays(days: number, unit: 'calendar' | 'working') {
  return `${days} ${unit === 'working' ? 'working ' : ''}${days === 1 ? 'day' : 'days'}`;
}

const EAT_OFFSET_MS = 3 * 3_600_000;
const nairobiDay = (instant: string) =>
  Math.floor((Date.parse(instant) + EAT_OFFSET_MS) / 86_400_000);

export type DeadlineTone = 'late' | 'today' | 'soon' | 'later';

/**
 * How far away a deadline is, in calendar days in Africa/Nairobi, measured from business
 * time: "Due today", "3 days left", "2 days late". `soon` is within a week.
 */
export function deadlineCountdown(
  deadline: string,
  now: string,
): { label: string; tone: DeadlineTone } {
  const days = nairobiDay(deadline) - nairobiDay(now);
  if (Date.parse(now) > Date.parse(deadline)) {
    const late = Math.max(1, -days);
    return {
      label: `${late} ${late === 1 ? 'day' : 'days'} late`,
      tone: 'late',
    };
  }
  if (days === 0) return { label: 'Due today', tone: 'today' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' };
  return { label: `${days} days left`, tone: days <= 7 ? 'soon' : 'later' };
}
