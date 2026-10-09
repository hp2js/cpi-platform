import type { BaselineCheck, Plan, RiskScale } from '@cpi/contracts';

/** The four approval checks (PRD §10.4, §10.7), worded as the officer confirms them. */
export const checkLabels: Record<BaselineCheck, string> = {
  materialCoverage: 'Milestones cover the material risks in the approved plan',
  objectiveConditions: 'Each milestone has an objective completion condition',
  mandatoryObligations:
    'The quarterly CPC and IAO meeting obligations are included',
  noFragmentation: 'No duplicate, trivial or artificially split milestones',
};

/** The same checks, worded as what the institution needs to fix after a return. */
export const failedCheckLabels: Record<BaselineCheck, string> = {
  materialCoverage: 'The milestones do not cover the material risks',
  objectiveConditions: 'Some completion conditions are not objective',
  mandatoryObligations: 'The committee meeting obligations are missing',
  noFragmentation: 'Milestones are duplicated, trivial or artificially split',
};

export const checkKeys = Object.keys(checkLabels) as BaselineCheck[];

/** The checks with their labels, in order, for the approve and return forms. */
export const checkItems = Object.entries(checkLabels) as [
  BaselineCheck,
  string,
][];
export const failedCheckItems = Object.entries(failedCheckLabels) as [
  BaselineCheck,
  string,
][];

export function latestBaselines(plan: Plan) {
  const byPeriod = new Map<string, Plan['baselines'][number]>();
  for (const baseline of plan.baselines) {
    const current = byPeriod.get(baseline.periodId);
    if (!current || baseline.version > current.version)
      byPeriod.set(baseline.periodId, baseline);
  }
  return [...byPeriod.values()].sort((a, b) =>
    a.periodId.localeCompare(b.periodId),
  );
}

/**
 * How a baseline's milestones spread over the plan's risks and activities, through each
 * milestone's activity link: which risks it leaves untreated, and which activities it splits.
 */
export function riskCoverage(
  plan: Plan,
  milestones: Plan['baselines'][number]['milestones'],
) {
  const activityOf = new Map(
    plan.activities.map((activity) => [activity.id, activity]),
  );
  const perActivity = new Map<string, number>();
  for (const milestone of milestones)
    if (milestone.activityId)
      perActivity.set(
        milestone.activityId,
        (perActivity.get(milestone.activityId) ?? 0) + 1,
      );
  const risks = [...plan.risks]
    .sort((a, b) => b.severity - a.severity || a.code.localeCompare(b.code))
    .map((risk) => ({
      risk,
      milestones: milestones.filter(
        (milestone) =>
          milestone.activityId &&
          activityOf.get(milestone.activityId)?.riskId === risk.id,
      ).length,
    }));
  const split = [...perActivity.entries()]
    .filter(([, count]) => count > 3)
    .map(([id, count]) => ({ activity: activityOf.get(id), count }));
  return { risks, split };
}

/**
 * The quarters the institution owes a proposal for: every returned one, and the earliest
 * not yet proposed. Quarters whose reporting has opened are past changing.
 */
export function proposalsDue(plan: Plan) {
  const open = plan.proposals.filter((proposal) => !proposal.locked);
  const returned = open.filter((proposal) => proposal.status === 'returned');
  const first = open.find((proposal) => proposal.status === 'not_proposed');
  return [...returned, ...(first ? [first] : [])].sort((a, b) =>
    a.periodId.localeCompare(b.periodId),
  );
}

/** Returned, overdue or due within a week: worth a badge. */
export function proposalsNeedingAttention(plan: Plan, now: string) {
  const week = 7 * 86_400_000;
  return proposalsDue(plan).filter(
    (proposal) =>
      proposal.status === 'returned' ||
      Date.parse(now) >= Date.parse(proposal.dueAt) - week,
  ).length;
}

/** "3 Possible": the number with the cycle's label for it, or the number alone. */
export function scalePoint(
  scale: RiskScale | undefined,
  axis: 'probability' | 'impact',
  value: number,
) {
  const label = scale?.[axis][value - 1];
  return label ? `${value} ${label}` : String(value);
}

/**
 * Every milestone weighs 1 in the simulation profile (PRD §10.4). Neither the institution nor
 * the officer sets weights: an approved rubric would, without changing the formula.
 */
export const EQUAL_WEIGHTS_NOTE =
  'Every milestone carries weight 1 in this simulation profile. Equal weights are a simplification: they do not mean the milestones matter equally. Institutions and officers do not set weights; an approved rubric could, without changing the formula (PRD §10.4).';
