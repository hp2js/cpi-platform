import type {
  ComponentScore,
  Decision,
  Fraction,
  Milestone,
  ReportAnswers,
  ScoreSummary,
} from '@cpi/contracts';
import { profileLabel } from './profiles';

/**
 * Stand-in for the backend scoring engine (HP2-18) implementing PRD §10.4 for the
 * implementation component. It lives in the mock layer only; the UI never recomputes it.
 */

/** points = maxPoints × numerator ÷ denominator, rounded half-up to two decimals, exactly. */
export function points(maxPoints: number, fraction: Fraction): string {
  const scaled = BigInt(maxPoints) * BigInt(fraction.numerator) * 100n;
  const denominator = BigInt(fraction.denominator);
  const hundredths = (scaled * 2n + denominator) / (denominator * 2n);
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
}

function calculated(maxPoints: number, fraction: Fraction): ComponentScore {
  return {
    status: 'calculated',
    fraction,
    maxPoints,
    points: points(maxPoints, fraction),
  };
}

function totalWeight(milestones: Milestone[]) {
  return milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
}

/**
 * Provisional credit: claimed complete AND referencing a file supplied with this revision.
 * A file cannot make an unclaimed achievement true, and a declaration earns nothing (FR08).
 */
export function provisionalCredits(
  milestones: Milestone[],
  answers: ReportAnswers,
  evidenceIds: string[],
) {
  return milestones.map((milestone) => {
    const response = answers.milestones[milestone.id];
    if (response?.completed !== true)
      return {
        milestoneId: milestone.id,
        credit: false,
        basis: 'not_claimed' as const,
      };
    const supported = response.evidence.some((reference) =>
      evidenceIds.includes(reference.evidenceId),
    );
    if (supported)
      return {
        milestoneId: milestone.id,
        credit: true,
        basis: 'claimed_with_evidence' as const,
      };
    return {
      milestoneId: milestone.id,
      credit: false,
      basis: response.evidenceUnavailable
        ? ('claimed_evidence_unavailable' as const)
        : ('claimed_without_evidence' as const),
    };
  });
}

export function scoreSummary(
  maxPoints: number,
  milestones: Milestone[],
  answers: ReportAnswers,
  evidenceIds: string[],
  decisions: Decision[],
  revision: number,
): ScoreSummary {
  const denominator = totalWeight(milestones);
  const credits = provisionalCredits(milestones, answers, evidenceIds);
  const provisional: ComponentScore =
    denominator === 0
      ? { status: 'pending', maxPoints, reason: 'baseline_not_approved' }
      : calculated(maxPoints, {
          numerator: milestones
            .filter(
              (milestone) =>
                credits.find((credit) => credit.milestoneId === milestone.id)
                  ?.credit,
            )
            .reduce((sum, milestone) => sum + milestone.weight, 0),
          denominator,
        });
  // Only active decisions on this revision count; superseded versions are history.
  const current = decisions.filter(
    (decision) =>
      decision.revision === revision && decision.supersededAt === null,
  );
  const allDecided =
    denominator > 0 &&
    milestones.every((milestone) =>
      current.some((decision) => decision.milestoneId === milestone.id),
    );
  const reviewed: ComponentScore = allDecided
    ? calculated(maxPoints, {
        numerator: milestones
          .filter(
            (milestone) =>
              current.find((decision) => decision.milestoneId === milestone.id)
                ?.outcome === 'accepted',
          )
          .reduce((sum, milestone) => sum + milestone.weight, 0),
        denominator,
      })
    : {
        status: 'pending',
        maxPoints,
        reason:
          denominator === 0
            ? 'baseline_not_approved'
            : 'awaiting_officer_decisions',
      };
  return {
    profileName: profileLabel(),
    simulation: true,
    provisional,
    provisionalCredits: credits,
    reviewed,
  };
}
