/** Whole days as words, for review and case age. */
export function ageLabel(days: number) {
  return days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}
