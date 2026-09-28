/** Business-time rules in Africa/Nairobi (UTC+03:00, no daylight saving). */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

const nairobiDate = (ms: number) =>
  new Date(ms + EAT_OFFSET_MS).toISOString().slice(0, 10);

/** Calendar days in Africa/Nairobi between the deadline and a later submission; 0 on time. */
export function daysLate(submittedAt: string, deadline: string) {
  const submitted = Date.parse(submittedAt);
  const due = Date.parse(deadline);
  if (submitted <= due) return 0;
  return Math.max(
    1,
    Math.round(
      (Date.parse(nairobiDate(submitted)) - Date.parse(nairobiDate(due))) /
        86_400_000,
    ),
  );
}

/**
 * Seven calendar days from the later of portal availability and in-app notification, ending
 * 23:59:59 Africa/Nairobi on the seventh day after that event's local date (PRD §7.3).
 */
export function responseDueAt(availableAt: string, notifiedAt: string) {
  const start = Math.max(Date.parse(availableAt), Date.parse(notifiedAt));
  const local = new Date(start + EAT_OFFSET_MS);
  const due = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 7,
      23,
      59,
      59,
    ),
  );
  return `${due.toISOString().slice(0, 19)}+03:00`;
}
