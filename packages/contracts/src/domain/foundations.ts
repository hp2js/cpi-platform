import { localDate } from './days.js';

/** Where the evaluation cutoff falls among an indicator's versions (PRD §10.3, AT28). */
export type VersionAtCutoff =
  | { status: 'applicable'; versionId: string }
  | { status: 'none' }
  | { status: 'conflict'; versionIds: string[] };

/**
 * The version effective on the cutoff's local date: effective from `effectiveFrom`, until the
 * day before `effectiveTo`. A withdrawn version never supplies credit. Overlapping versions are
 * a conflict for the officer to resolve, never silently a zero.
 */
export function versionAtCutoff(
  versions: {
    id: string;
    status: 'active' | 'superseded' | 'withdrawn';
    effectiveFrom: string;
    effectiveTo: string | null;
  }[],
  cutoff: string,
): VersionAtCutoff {
  const date = localDate(cutoff);
  const covering = versions.filter(
    (version) =>
      version.status !== 'withdrawn' &&
      version.effectiveFrom <= date &&
      (version.effectiveTo === null || date < version.effectiveTo),
  );
  if (covering.length === 0) return { status: 'none' };
  if (covering.length > 1)
    return {
      status: 'conflict',
      versionIds: covering.map((version) => version.id),
    };
  return { status: 'applicable', versionId: covering[0]!.id };
}

/** The review the annual result counts: of the version at the cutoff, or the unsupported disposition. */
export function reviewAtCutoff<Review extends { versionId: string | null }>(
  reviews: Review[], // newest first
  atCutoff: VersionAtCutoff,
): Review | undefined {
  if (atCutoff.status === 'applicable')
    return reviews.find((review) => review.versionId === atCutoff.versionId);
  if (atCutoff.status === 'none')
    return reviews.find((review) => review.versionId === null);
  return undefined;
}
