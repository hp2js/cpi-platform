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
