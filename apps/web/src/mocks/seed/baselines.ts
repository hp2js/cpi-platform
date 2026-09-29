import type { BaselineCheck, Milestone } from '@cpi/contracts';
import { cycle } from './cycle';
import { institutions } from './cast';

/** A baseline version. Amendments add versions; earlier versions are never edited (PRD §10.4). */
export interface MockBaseline {
  id: string;
  institutionId: string;
  periodId: string;
  version: number;
  status: 'proposed' | 'approved' | 'returned';
  milestones: Milestone[];
  historicalSeed: {
    reason: string;
    loadedAt: string;
    confirmedBy: string | null;
    confirmedAt: string | null;
  } | null;
  approval: {
    by: string;
    at: string;
    rationale: string;
    checks: {
      materialCoverage: boolean;
      objectiveConditions: boolean;
      mandatoryObligations: boolean;
      noFragmentation: boolean;
    };
  } | null;
  returned: {
    by: string;
    at: string;
    reason: string;
    failedChecks: BaselineCheck[];
  } | null;
}

/** One substantive risk and mitigation per fictional institution (PRD §3.3, §17.1). */
export const plans: Record<
  string,
  { risk: string; activity: string; milestone: string; condition: string }
> = {
  'DEMO-001': {
    risk: 'R-01 Discretionary allocation of appointments',
    activity: 'A-01 Establish a controlled allocation register',
    milestone: 'Allocation register operational and exception review completed',
    condition:
      'The register is in use and an exception review was completed by quarter end.',
  },
  'DEMO-002': {
    risk: 'R-01 Undocumented waivers of connection fees',
    activity: 'A-01 Introduce a waiver approval workflow',
    milestone: 'Waiver approvals recorded in the new workflow',
    condition:
      'All fee waivers granted this quarter carry a recorded second approval.',
  },
  'DEMO-003': {
    risk: 'R-01 Discretionary licence inspections',
    activity: 'A-01 Publish an inspection schedule',
    milestone: 'Inspection schedule published and followed',
    condition:
      'The schedule was published and at least 90% of inspections followed it.',
  },
  'DEMO-004': {
    risk: 'R-01 Manual penalty write-offs',
    activity: 'A-01 Restrict write-off authority',
    milestone: 'Write-off authority matrix approved and applied',
    condition:
      'The matrix was approved and write-offs this quarter comply with it.',
  },
  'DEMO-005': {
    risk: 'R-01 Irregular procurement of medical supplies',
    activity: 'A-01 Introduce supplier rotation',
    milestone: 'Supplier rotation applied to quarterly orders',
    condition: 'Quarterly orders were placed using the rotation list.',
  },
  'DEMO-006': {
    risk: 'R-01 Inflated contract variations',
    activity: 'A-01 Require independent variation reviews',
    milestone: 'Independent review completed for each variation',
    condition:
      'Each contract variation this quarter has an independent review record.',
  },
  'DEMO-007': {
    risk: 'R-01 Favouritism in bursary awards',
    activity: 'A-01 Publish award criteria and results',
    milestone: 'Award criteria and results published',
    condition:
      'Criteria were published before awards, and results after, for the quarter.',
  },
  'DEMO-008': {
    risk: 'R-01 Unrecorded changes to land records',
    activity: 'A-01 Introduce change logs for record edits',
    milestone: 'Change log enabled and reviewed',
    condition: 'The change log is enabled and was reviewed by quarter end.',
  },
};

const officerFor = (institutionId: string) =>
  Number(institutionId.slice(-3)) <= 4
    ? 'Prevention Officer A'
    : 'Prevention Officer B';

function milestone(
  institutionId: string,
  code: string,
  fields: Omit<Milestone, 'id' | 'code' | 'weight' | 'activityId'> & {
    weight?: number;
    activityCode: string | null;
  },
): Milestone {
  const { activityCode, ...rest } = fields;
  return {
    id: `${institutionId}:${code}`,
    code,
    weight: 1,
    activityId: activityCode && `${institutionId}:${activityCode}`,
    ...rest,
  };
}

/** The committee meetings added to every proposal: CPC-Qn and IAO-Qn for a new quarter. */
export function committeeCodes(quarter: number): [string, string] {
  return [`CPC-Q${quarter}`, `IAO-Q${quarter}`];
}

export function committee(
  institutionId: string,
  cpc: string,
  iao: string,
): Milestone[] {
  return [
    milestone(institutionId, cpc, {
      title: 'Quarterly CPC meeting held',
      activity: 'Committee obligation',
      activityCode: null,
      risk: 'All identified risks',
      completionCondition:
        'The Corruption Prevention Committee met during the quarter.',
      evidenceExpectation: 'Signed CPC minutes.',
      mandatory: true,
    }),
    milestone(institutionId, iao, {
      title: 'Quarterly IAO meeting held',
      activity: 'Committee obligation',
      activityCode: null,
      risk: 'All identified risks',
      completionCondition:
        'The Integrity Assurance Officers met during the quarter.',
      evidenceExpectation: 'Signed IAO minutes.',
      mandatory: true,
    }),
  ];
}

/** Quarter q uses milestone codes M-(4q-3) … M-(4q). */
function quarterMilestones(
  institutionId: string,
  quarter: number,
): Milestone[] {
  const plan = plans[institutionId]!;
  const code = (offset: number) =>
    `M-${String(4 * (quarter - 1) + offset).padStart(2, '0')}`;
  const substantive: Milestone[] =
    quarter === 1
      ? [
          milestone(institutionId, code(1), {
            title: plan.milestone,
            activity: plan.activity,
            activityCode: 'A-01',
            risk: plan.risk,
            completionCondition: plan.condition,
            evidenceExpectation:
              'Minutes or progress report passage recording completion.',
            mandatory: false,
          }),
          milestone(institutionId, code(2), {
            title: 'Staff trained on the corruption prevention procedure',
            activity: 'A-02 Train staff in affected functions',
            activityCode: 'A-02',
            risk: plan.risk,
            completionCondition:
              'Training delivered to the staff named in the plan by quarter end.',
            evidenceExpectation:
              'Minutes recording the training and attendance.',
            mandatory: false,
          }),
        ]
      : [
          milestone(institutionId, code(1), {
            title: `${plan.milestone}: quarter ${quarter} exception review`,
            activity: plan.activity,
            activityCode: 'A-01',
            risk: plan.risk,
            completionCondition: `An exception review of the control was completed and recorded by the end of Q${quarter}.`,
            evidenceExpectation:
              'Minutes or progress report passage recording the review.',
            mandatory: false,
          }),
          milestone(institutionId, code(2), {
            title: 'Procurement approval spot-check completed',
            activity: 'A-03 Spot-check procurement approvals',
            activityCode: 'A-03',
            risk: 'R-02 Weak oversight of procurement approvals',
            completionCondition: `A sample of at least ten approvals was checked in Q${quarter} and findings recorded.`,
            evidenceExpectation: 'Spot-check findings in the CPC minutes.',
            mandatory: false,
          }),
        ];
  return [...substantive, ...committee(institutionId, code(3), code(4))];
}

/**
 * The inflated proposal from PRD §10.7 / AT31: the same two substantive milestones plus
 * eight trivial ones, which would dilute the committee obligations if approved.
 */
function inflatedProposal(institutionId: string): Milestone[] {
  const base = quarterMilestones(institutionId, 2);
  const trivial = [
    'Circulate meeting notice',
    'Book meeting room',
    'Print agenda',
    'Update notice board',
    'Email reminder to staff',
    'File minutes copy',
    'Update contact list',
    'Archive attendance sheet',
  ].map((title, index) =>
    milestone(institutionId, `M-${20 + index}`, {
      title,
      activity: 'A-99 Administrative tasks',
      activityCode: 'A-99',
      risk: 'R-01',
      completionCondition: `${title} completed.`,
      evidenceExpectation: 'Self-declaration.',
      mandatory: false,
    }),
  );
  return [...base, ...trivial];
}

const SEED_LOADED_AT = '2026-09-25T10:00:00+03:00';

export const initialBaselines: MockBaseline[] = institutions.flatMap(
  (institution) =>
    cycle.periods.map((period): MockBaseline => {
      const common = {
        id: `bl-${institution.id}-${period.label}-v1`,
        institutionId: institution.id,
        periodId: period.id,
        version: 1,
        returned: null,
      };
      if (period.quarter === 1) {
        return {
          ...common,
          status: 'approved',
          milestones: quarterMilestones(institution.id, 1),
          // Simulation-only exception: loaded from the fictional approved plan; the officer must
          // still confirm correspondence before any dependent score is finalized.
          historicalSeed: {
            reason:
              'SEEDED HISTORICAL BASELINE for the simulated year, loaded from the fictional approved plan.',
            loadedAt: SEED_LOADED_AT,
            confirmedBy: null,
            confirmedAt: null,
          },
          approval: {
            by: officerFor(institution.id),
            at: SEED_LOADED_AT,
            rationale:
              'Seeded for the simulated year; correspondence with the approved plan awaits officer confirmation.',
            checks: {
              materialCoverage: true,
              objectiveConditions: true,
              mandatoryObligations: true,
              noFragmentation: true,
            },
          },
        };
      }
      return {
        ...common,
        status: 'proposed',
        milestones:
          institution.id === 'DEMO-004' && period.quarter === 2
            ? inflatedProposal(institution.id)
            : quarterMilestones(institution.id, period.quarter),
        historicalSeed: null,
        approval: null,
      };
    }),
);
