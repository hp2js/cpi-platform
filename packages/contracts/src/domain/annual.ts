import type {
  FoundationKind,
  IndicatorWeights,
  ReopenEligibility,
} from '../draft/index.js';
import { add, format2, mul, rational, sum, type Rational } from './rational.js';

/**
 * The annual demo score (PRD §10.5): A = 10P + 15R + 15M + 60 × (I1 + I2 + I3 + I4) ÷ 4.
 * Foundations count once and every quarter carries equal weight; there is no renormalization
 * over reported quarters. Exact until display, rounded half-up to two decimals. Callers pass
 * a final fraction for every input, or decide the result is pending (a null is never a zero).
 */
export function annualTotal(
  weights: IndicatorWeights,
  foundations: Record<FoundationKind, Rational>,
  quarters: Rational[],
) {
  const foundationPoints = sum([
    mul(rational(weights.procedures), foundations.procedures),
    mul(rational(weights.riskAssessment), foundations.risk_assessment),
    mul(rational(weights.mitigationPlan), foundations.mitigation_plan),
  ]);
  const average = mul(sum(quarters), rational(1, quarters.length));
  const implementationPoints = mul(rational(weights.implementation), average);
  return {
    status: 'calculated' as const,
    points: format2(add(foundationPoints, implementationPoints)),
    implementationAverage: {
      numerator: Number(average.n),
      denominator: Number(average.d),
    },
    foundationPoints: format2(foundationPoints),
    implementationPoints: format2(implementationPoints),
  };
}

/**
 * Whether a finalized review can be reopened (PRD §7.4), with the reason in words when it
 * cannot. Shared by the API and the mock: the review page explains it before asking for a
 * reason, and the reopen action enforces the same rule (HP2-51).
 */
export function reopenEligibility(input: {
  finalized: boolean;
  current: boolean;
  periodId: string;
  periodLabel: string;
  institutionId: string;
  published: boolean;
  /** The institution's open correction case, if any. */
  correction: NonNullable<ReopenEligibility['correction']> | null;
}): ReopenEligibility {
  const { published, correction } = input;
  const refuse = (reason: string) => ({
    allowed: false,
    reason,
    published,
    correction,
  });
  if (!input.finalized)
    return refuse('Only a finalized review can be reopened.');
  if (!input.current) return refuse('A newer revision exists.');
  if (published && !correction)
    return refuse(
      `${input.institutionId}'s annual result is published. An administrator must open a correction case for ${input.periodLabel} before this review can be reopened.`,
    );
  if (published && correction && correction.periodId !== input.periodId)
    return refuse(
      `The open correction case for ${input.institutionId} is for ${correction.periodLabel}, not ${input.periodLabel}. An administrator must open a case for ${input.periodLabel} before this review can be reopened.`,
    );
  return { allowed: true, reason: null, published, correction };
}
