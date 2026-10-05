import type { FoundationKind, IndicatorWeights } from '../draft/index.js';
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

/** AT28: validity dates are Nairobi calendar days; effectiveTo is exclusive.
 * Select the version at the evaluation cutoff, even if it has since been superseded.
 * A withdrawal leaves the evaluation pending; it must not revive older credit.
 */
export function foundationAtCutoff<
  T extends {
    effectiveFrom: string;
    effectiveTo: string | null;
    version: number;
    status: string;
  },
>(versions: readonly T[], cutoff: string): T | undefined {
  const instant = Date.parse(cutoff);
  const start = (date: string) => Date.parse(`${date}T00:00:00+03:00`);
  const eligible = versions
    .filter(
      (v) =>
        start(v.effectiveFrom) <= instant &&
        (v.effectiveTo === null || instant < start(v.effectiveTo)),
    )
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version,
    );
  const selected = eligible[0];
  return selected?.status === 'withdrawn' ? undefined : selected;
}
