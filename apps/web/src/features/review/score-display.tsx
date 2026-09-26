import type { ComponentScore } from '@cpi/contracts';

const pendingReasons: Record<
  Extract<ComponentScore, { status: 'pending' }>['reason'],
  string
> = {
  baseline_not_approved: 'Pending baseline approval',
  awaiting_officer_decisions: 'Pending: awaiting decisions on every milestone',
  foundation_not_reviewed: 'Pending foundation review',
};

/** Always states what kind of value it is; pending is shown as pending, never as zero. */
export function ComponentScoreValue({ score }: { score: ComponentScore }) {
  if (score.status === 'pending')
    return (
      <span className="text-sm font-medium text-muted-foreground">
        {pendingReasons[score.reason]}
      </span>
    );
  return (
    <span className="grid">
      <span className="text-2xl font-semibold tabular-nums">
        {score.points}
        <span className="text-base font-normal text-muted-foreground">
          {' '}
          / {score.maxPoints} points
        </span>
      </span>
      <span className="text-sm text-muted-foreground">
        {score.fraction.numerator} of {score.fraction.denominator} milestone
        weight
      </span>
    </span>
  );
}
