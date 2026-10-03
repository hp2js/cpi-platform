/**
 * HP2-11 independent worksheet arithmetic. It imports only the fixture catalogue — not the scoring
 * engine, the API, the mock or the seed — and restates PRD §§10.3–10.5 directly, so an
 * expected result cannot inherit a defect from the code it checks. `worksheet.test.ts`
 * enforces the isolation.
 */

import type {
  AnnualExpected,
  AnnualInputs,
  ExpectedScore,
  FoundationInput,
  FoundationVersion,
  QuarterExpected,
  QuarterInputs,
  ScoringFixture,
} from './catalogue.js';

/** An exact non-negative fraction. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

export function ratio(num: number | bigint, den: number | bigint = 1): Ratio {
  const n = BigInt(num);
  const d = BigInt(den);
  if (d <= 0n || n < 0n) throw new Error(`Invalid ratio ${n}/${d}`);
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

export const plus = (a: Ratio, b: Ratio) =>
  ratio(a.num * b.den + b.num * a.den, a.den * b.den);
export const times = (a: Ratio, b: Ratio) =>
  ratio(a.num * b.num, a.den * b.den);
export const total = (values: Ratio[]) => values.reduce(plus, ratio(0));

/** "13/16"; whole numbers as "n/1" so a fraction is always visible as one. */
export const fractionText = (value: Ratio) => `${value.num}/${value.den}`;

/**
 * Display rounding, PRD §10.5: half-up to two decimals, applied to the exact value. Written
 * as decimal string arithmetic rather than the engine's formula.
 */
export function display2(value: Ratio): string {
  // Truncated to three decimals: the value is at least x.xx5 exactly when the third digit is 5+.
  const thousandths = (value.num * 1000n) / value.den;
  let hundredths = thousandths / 10n;
  if (thousandths % 10n >= 5n) hundredths += 1n;
  const whole = hundredths / 100n;
  const cents = String(hundredths % 100n).padStart(2, '0');
  return `${whole}.${cents}`;
}

/** PRD §10.3: four equally weighted binary checks; fraction = accepted checks ÷ 4. */
export function foundationFraction(acceptedChecks: number): Ratio {
  if (
    !Number.isInteger(acceptedChecks) ||
    acceptedChecks < 0 ||
    acceptedChecks > 4
  )
    throw new Error(`A foundation has four checks, not ${acceptedChecks}`);
  return ratio(acceptedChecks, 4);
}

/**
 * PRD §10.4: Iq = accepted milestone weight ÷ all locked milestone weight due in the
 * quarter. An empty locked baseline is not full credit: there is no fraction (pending).
 */
export function quarterFraction(
  acceptedWeight: number,
  lockedWeight: number,
): Ratio | null {
  if (lockedWeight === 0) return null;
  if (acceptedWeight > lockedWeight)
    throw new Error('Accepted weight cannot exceed the locked denominator');
  return ratio(acceptedWeight, lockedWeight);
}

export interface AnnualWeights {
  procedures: number;
  riskAssessment: number;
  mitigationPlan: number;
  implementation: number;
}

/**
 * PRD §10.5: A = 10P + 15R + 15M + 60 × (I1 + I2 + I3 + I4) ÷ 4. Foundations once, four
 * equal quarters, no renormalization over reported quarters, nothing rounded until display.
 */
export function annualScore(
  weights: AnnualWeights,
  foundations: {
    procedures: Ratio;
    riskAssessment: Ratio;
    mitigationPlan: Ratio;
  },
  quarters: [Ratio, Ratio, Ratio, Ratio],
) {
  const foundationPoints = total([
    times(ratio(weights.procedures), foundations.procedures),
    times(ratio(weights.riskAssessment), foundations.riskAssessment),
    times(ratio(weights.mitigationPlan), foundations.mitigationPlan),
  ]);
  const implementationAverage = times(total(quarters), ratio(1, 4));
  const implementationPoints = times(
    ratio(weights.implementation),
    implementationAverage,
  );
  return {
    foundationPoints,
    implementationAverage,
    implementationPoints,
    total: plus(foundationPoints, implementationPoints),
  };
}

/** Calendar days between two Africa/Nairobi (UTC+03:00) local dates; 0 when on time. */
export function calendarDaysLate(submittedAt: string, deadline: string) {
  if (Date.parse(submittedAt) <= Date.parse(deadline)) return 0;
  const nairobiDay = (instant: string) =>
    Math.floor((Date.parse(instant) + 3 * 3_600_000) / 86_400_000);
  return Math.max(1, nairobiDay(submittedAt) - nairobiDay(deadline));
}

/** The worksheet's own result for a fixture, in the shape of its `expected` field. */
export function worksheetResult(
  fixture: ScoringFixture,
): QuarterExpected | AnnualExpected {
  return fixture.inputs.kind === 'quarter'
    ? quarterResult(fixture.inputs)
    : annualResult(fixture.inputs);
}

function quarterResult(inputs: QuarterInputs): QuarterExpected {
  // Only the locked baseline counts; claims about other quarters' milestones are ignored.
  const locked = inputs.milestones.reduce((sum, row) => sum + row.weight, 0);
  const score = (accepted: number): ExpectedScore => ({
    status: 'calculated',
    fraction: `${accepted}/${locked}`,
    points: display2(
      times(ratio(inputs.maxPoints), quarterFraction(accepted, locked)!),
    ),
  });
  const revisions = [1, ...inputs.decisions.map((row) => row.revision)];
  const result: QuarterExpected =
    locked === 0
      ? {
          provisional: { status: 'pending', reason: 'baseline_not_approved' },
          reviewed: [...new Set(revisions)].map((revision) => ({
            revision,
            score: { status: 'pending', reason: 'baseline_not_approved' },
          })),
        }
      : {
          // Binary credit: claimed complete AND citing a file actually supplied.
          provisional: score(
            inputs.milestones
              .filter(
                (row) =>
                  row.claimed === true &&
                  row.evidence.some((file) =>
                    inputs.suppliedFiles.includes(file),
                  ),
              )
              .reduce((sum, row) => sum + row.weight, 0),
          ),
          reviewed: [...new Set(revisions)].map((revision) => {
            const outcome = (code: string) =>
              inputs.decisions.find(
                (row) => row.code === code && row.revision === revision,
              )?.outcome;
            const decided = inputs.milestones.every((row) => outcome(row.code));
            return {
              revision,
              score: decided
                ? score(
                    inputs.milestones
                      .filter((row) => outcome(row.code) === 'accepted')
                      .reduce((sum, row) => sum + row.weight, 0),
                  )
                : { status: 'pending', reason: 'awaiting_officer_decisions' },
            };
          }),
        };
  if (inputs.lateness)
    result.daysLate = calendarDaysLate(
      inputs.lateness.submittedAt,
      inputs.lateness.deadline,
    );
  return result;
}

/**
 * PRD §10.3: the version effective at the cutoff, never a withdrawn one. With no valid
 * version the checks are unsupported (0/4); overlapping valid versions need clarification.
 */
export function effectiveVersion(
  versions: FoundationVersion[],
  cutoff: string,
): FoundationVersion | null {
  const day = cutoff.slice(0, 10);
  const valid = versions.filter(
    (version) =>
      version.status !== 'withdrawn' &&
      version.effectiveFrom <= day &&
      (version.effectiveTo === null || day <= version.effectiveTo),
  );
  if (valid.length > 1)
    throw new Error(
      'Conflicting effective dates block final foundation disposition',
    );
  return valid[0] ?? null;
}

function foundationInput(input: FoundationInput, cutoff: string) {
  if ('acceptedChecks' in input)
    return foundationFraction(input.acceptedChecks);
  return foundationFraction(
    effectiveVersion(input.versions, cutoff)?.acceptedChecks ?? 0,
  );
}

function annualResult(inputs: AnnualInputs): AnnualExpected {
  const quarters = inputs.quarters.map((row) =>
    row.status === 'finalized'
      ? quarterFraction(row.accepted, row.locked)
      : row.status === 'closed_without_submission'
        ? ratio(0) // an explicit officer disposition, never an inferred one
        : null,
  );
  if (quarters.some((quarter) => quarter === null))
    return { status: 'pending' };
  const score = annualScore(
    {
      procedures: 10,
      riskAssessment: 15,
      mitigationPlan: 15,
      implementation: 60,
    },
    {
      procedures: foundationInput(inputs.foundations.procedures, inputs.cutoff),
      riskAssessment: foundationInput(
        inputs.foundations.riskAssessment,
        inputs.cutoff,
      ),
      mitigationPlan: foundationInput(
        inputs.foundations.mitigationPlan,
        inputs.cutoff,
      ),
    },
    quarters as [Ratio, Ratio, Ratio, Ratio],
  );
  return {
    status: 'calculated',
    foundationPoints: display2(score.foundationPoints),
    implementationAverage: fractionText(score.implementationAverage),
    implementationPoints: display2(score.implementationPoints),
    total: display2(score.total),
  };
}
