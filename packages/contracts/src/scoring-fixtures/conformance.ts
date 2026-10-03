import type {
  ComponentScore,
  Decision,
  FoundationKind,
  Milestone,
  ReportAnswers,
} from '../draft/index.js';
import { annualTotal } from '../domain/annual.js';
import { rational, type Rational } from '../domain/rational.js';
import { scoreSummary } from '../domain/scoring.js';
import { daysLate } from '../domain/time.js';
import { initialProfiles } from '../fixtures/profiles.js';
import {
  inputVersions,
  type AnnualExpected,
  type AnnualInputs,
  type ExpectedScore,
  type FoundationInput,
  type MilestoneRow,
  type QuarterExpected,
  type QuarterInputs,
  type ScoringFixture,
} from './catalogue.js';

/**
 * Executes HP2-11 fixtures against the implementation's shared scoring engine — the same
 * `scoreSummary` and `annualTotal` the API and the mock call — and reports actual against
 * expected. Workflow states (blocking, closure, refusal) are executed by the tests each
 * fixture lists in `workflowTests`.
 */

const profile = initialProfiles.find(
  (candidate) => candidate.id === inputVersions.profile.id,
)!;

const milestoneId = (code: string) => `SF:${code}`;

function milestone(row: MilestoneRow): Milestone {
  return {
    id: milestoneId(row.code),
    code: row.code,
    title: row.code,
    activity: '',
    risk: '',
    activityId: null,
    completionCondition: '',
    evidenceExpectation: '',
    weight: row.weight,
    mandatory: false,
  };
}

function answers(rows: MilestoneRow[]): ReportAnswers {
  return {
    questions: {},
    milestones: Object.fromEntries(
      rows.map((row) => [
        milestoneId(row.code),
        {
          completed: row.claimed,
          output: '',
          emergingIssues: '',
          actions: '',
          evidence: row.evidence.map((evidenceId) => ({
            evidenceId,
            passage: 'p. 1',
          })),
          evidenceUnavailable: null,
        },
      ]),
    ),
  };
}

function decisions(
  rows: { code: string; outcome: 'accepted' | 'rejected'; revision: number }[],
): Decision[] {
  return rows.map((row, index) => ({
    id: `SF-decision-${index}`,
    milestoneId: milestoneId(row.code),
    outcome: row.outcome,
    reason: row.outcome === 'rejected' ? 'Not substantiated' : '',
    revision: row.revision,
    decidedBy: 'Officer',
    decidedAt: '2027-07-01T09:00:00+03:00',
    carriedForwardFrom: null,
    supersededAt: null,
  }));
}

function asExpected(score: ComponentScore): ExpectedScore {
  if (score.status === 'calculated')
    return {
      status: 'calculated',
      fraction: `${score.fraction.numerator}/${score.fraction.denominator}`,
      points: score.points,
    };
  return {
    status: 'pending',
    reason: score.reason as Extract<
      ExpectedScore,
      { status: 'pending' }
    >['reason'],
  };
}

function runQuarter(
  inputs: QuarterInputs,
  revisions: number[],
): QuarterExpected {
  const baseline = inputs.milestones.map(milestone);
  const reported = answers([
    ...inputs.milestones,
    ...(inputs.outOfBaseline ?? []),
  ]);
  const summary = (revision: number) =>
    scoreSummary(
      inputs.maxPoints,
      baseline,
      reported,
      inputs.suppliedFiles,
      decisions(inputs.decisions),
      revision,
      profile.name,
    );
  const result: QuarterExpected = {
    provisional: asExpected(summary(revisions[0] ?? 1).provisional),
    reviewed: revisions.map((revision) => ({
      revision,
      score: asExpected(summary(revision).reviewed),
    })),
  };
  if (inputs.lateness)
    result.daysLate = daysLate(
      inputs.lateness.submittedAt,
      inputs.lateness.deadline,
      { mode: 'calendar', holidays: [] },
    );
  return result;
}

/**
 * The API and the mock score the foundation version whose status is `active`
 * (`foundationOutcome` in apps/api/src/annual/data.ts and the mock's services/annual.ts);
 * this mirrors that selection so a fixture whose valid-at-cutoff version is not the active
 * one would surface as a discrepancy.
 */
function foundation(input: FoundationInput): Rational {
  if ('acceptedChecks' in input) return rational(input.acceptedChecks, 4);
  const active = input.versions.find((version) => version.status === 'active');
  return rational(active?.acceptedChecks ?? 0, 4);
}

function runAnnual(inputs: AnnualInputs): AnnualExpected {
  const quarters = inputs.quarters.map((row): Rational | null => {
    if (row.status === 'closed_without_submission') return rational(0);
    if (row.status !== 'finalized') return null;
    // A finalized quarter's fraction comes from the engine over a locked baseline.
    const rows = Array.from({ length: row.locked }, (_, index) => ({
      code: `Q-${index + 1}`,
      weight: 1,
      claimed: index < row.accepted,
      evidence: ['ev-1'],
    }));
    const reviewed = runQuarter(
      {
        kind: 'quarter',
        maxPoints: profile.weights.implementation,
        milestones: rows,
        suppliedFiles: ['ev-1'],
        decisions: rows.map((candidate, index) => ({
          code: candidate.code,
          outcome: index < row.accepted ? 'accepted' : 'rejected',
          revision: 1,
        })),
      },
      [1],
    ).reviewed[0]!.score;
    if (reviewed.status !== 'calculated') return null;
    const [n, d] = reviewed.fraction.split('/').map(Number);
    return rational(n!, d!);
  });
  if (quarters.some((quarter) => quarter === null))
    return { status: 'pending' };
  const foundations: Record<FoundationKind, Rational> = {
    procedures: foundation(inputs.foundations.procedures),
    risk_assessment: foundation(inputs.foundations.riskAssessment),
    mitigation_plan: foundation(inputs.foundations.mitigationPlan),
  };
  const total = annualTotal(
    profile.weights,
    foundations,
    quarters as Rational[],
  );
  return {
    status: 'calculated',
    foundationPoints: total.foundationPoints,
    implementationAverage: `${total.implementationAverage.numerator}/${total.implementationAverage.denominator}`,
    implementationPoints: total.implementationPoints,
    total: total.points,
  };
}

export interface ConformanceRow {
  fixture: ScoringFixture;
  actual: QuarterExpected | AnnualExpected;
  outcome: 'pass' | 'fail';
}

/** Key order is not meaningful: compare canonical JSON. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export function runFixture(fixture: ScoringFixture): ConformanceRow {
  const actual =
    fixture.inputs.kind === 'quarter'
      ? runQuarter(
          fixture.inputs,
          (fixture.expected as QuarterExpected).reviewed.map(
            (row) => row.revision,
          ),
        )
      : runAnnual(fixture.inputs);
  return {
    fixture,
    actual,
    outcome: same(actual, fixture.expected) ? 'pass' : 'fail',
  };
}

/** The implementation's default profile, compared with the versions the fixtures assume. */
export function profileConformance() {
  return {
    id: profile.id,
    name: profile.name,
    version: profile.version,
    formula: profile.formulaVersion,
    rounding: profile.rounding,
    weights: profile.weights,
  };
}
