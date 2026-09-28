/** Whole days between two instants, for display of review and case age. */
export function daysBetween(from: string, to: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000),
  );
}

export function ageLabel(days: number) {
  return days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}
