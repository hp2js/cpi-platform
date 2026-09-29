import type { ComponentScore } from '@cpi/contracts';

const pendingReasons: Record<
  Extract<ComponentScore, { status: 'pending' }>['reason'],
  string
> = {
  baseline_not_approved: 'Pending baseline approval',
  awaiting_officer_decisions: 'Pending: awaiting decisions on every milestone',
  foundation_not_reviewed: 'Pending: the active version has not been reviewed',
};

/** Always states what kind of value it is; pending is shown as pending, never as zero. */
export function ComponentScoreValue({
  score,
  unit = 'milestone weight',
}: {
  score: ComponentScore;
  unit?: string;
}) {
  if (score.status === 'pending')
    return (
      <span className="text-sm font-bold text-base-dark">
        {pendingReasons[score.reason]}
      </span>
    );
  return (
    <span className="grid">
      <span className="text-xl font-bold tabular-nums">
        {score.points}
        <span className="text-sm font-normal text-base-dark">
          {' '}
          / {score.maxPoints} points
        </span>
      </span>
      <span className="text-sm text-base-dark">
        {score.fraction.numerator} of {score.fraction.denominator} {unit}
      </span>
    </span>
  );
}
