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
