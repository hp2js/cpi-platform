import type {
  ConsolidatedReport,
  ConsolidatedSummaryRow,
  FoundationKind,
  IndicatorWeights,
  PublishedResult,
  ReopenEligibility,
} from '../draft/index.js';
import { points } from './scoring.js';
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

/**
 * The consolidated report's summary, publication batches and corrections (HP2-66), from the
 * published results themselves, so the summary matches each institution's page and the exports.
 * `history` is every published version in scope, current and superseded.
 */
export function consolidatedSummary(
  released: PublishedResult[],
  unreleased: ConsolidatedReport['unreleased'],
  history: PublishedResult[],
): Pick<ConsolidatedReport, 'summary' | 'batches' | 'corrections'> {
  const releasedRows: ConsolidatedSummaryRow[] = released.map((result) => {
    const { evaluation } = result;
    const quarterMax = evaluation.weights.implementation / 4;
    const quarters = evaluation.quarters.map((quarter) => ({
      periodLabel: quarter.periodLabel,
      status: quarter.status,
      points: quarter.implementation
        ? points(quarterMax, quarter.implementation)
        : null,
      late: quarter.late,
    }));
    return {
      institutionId: result.institutionId,
      institutionName: result.institutionName,
      released: true,
      reasons: [],
      points:
        evaluation.total.status === 'calculated'
          ? evaluation.total.points
          : null,
      foundationPoints:
        evaluation.total.status === 'calculated'
          ? evaluation.total.foundationPoints
          : null,
      quarters,
      lateQuarters: quarters.filter((quarter) => quarter.late).length,
      officerName: evaluation.officerName,
      version: result.version,
      publishedAt: result.publishedAt,
    };
  });
  const unreleasedRows: ConsolidatedSummaryRow[] = unreleased.map((row) => ({
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    released: false,
    reasons: row.reasons,
    points: null,
    foundationPoints: null,
    quarters: [],
    lateQuarters: 0,
    officerName: null,
    version: null,
    publishedAt: null,
  }));
  const batches = new Map<string, ConsolidatedReport['batches'][number]>();
  for (const result of [...history].sort(
    (a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
  )) {
    const batch = batches.get(result.batchId);
    if (batch) batch.institutions += 1;
    else
      batches.set(result.batchId, {
        batchId: result.batchId,
        publishedAt: result.publishedAt,
        publishedBy: result.publishedBy,
        institutions: 1,
      });
  }
  return {
    summary: [...releasedRows, ...unreleasedRows].sort((a, b) =>
      a.institutionId.localeCompare(b.institutionId),
    ),
    batches: [...batches.values()],
    corrections: history
      .filter((result) => result.correctionReason !== null)
      .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
      .map((result) => ({
        institutionId: result.institutionId,
        institutionName: result.institutionName,
        fromVersion: result.version - 1,
        toVersion: result.version,
        reason: result.correctionReason!,
        publishedAt: result.publishedAt,
        publishedBy: result.publishedBy,
      })),
  };
}
