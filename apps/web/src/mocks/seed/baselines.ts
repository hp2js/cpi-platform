import type { Milestone } from '@cpi/contracts';
import { cycle } from './cycle';
import { institutions } from './cast';

export interface MockBaseline {
  institutionId: string;
  periodId: string;
  status: 'approved' | 'pending_approval';
  milestones: Milestone[];
}

/** One substantive risk and mitigation per fictional institution (PRD §3.3, §17.1). */
const plans: Record<
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

function q1Milestones(institutionId: string): Milestone[] {
  const plan = plans[institutionId]!;
  return [
    {
      id: `${institutionId}:M-01`,
      code: 'M-01',
      title: plan.milestone,
      activity: plan.activity,
      risk: plan.risk,
      completionCondition: plan.condition,
      evidenceExpectation:
        'Minutes or progress report passage recording completion.',
      weight: 1,
      mandatory: false,
    },
    {
      id: `${institutionId}:M-02`,
      code: 'M-02',
      title: 'Staff trained on the corruption prevention procedure',
      activity: 'A-02 Train staff in affected functions',
      risk: plan.risk,
      completionCondition:
        'Training delivered to the staff named in the plan by quarter end.',
      evidenceExpectation: 'Minutes recording the training and attendance.',
      weight: 1,
      mandatory: false,
    },
    {
      id: `${institutionId}:M-03`,
      code: 'M-03',
      title: 'Quarterly CPC meeting held',
      activity: 'Committee obligation',
      risk: 'All identified risks',
      completionCondition:
        'The Corruption Prevention Committee met during the quarter.',
      evidenceExpectation: 'Signed CPC minutes.',
      weight: 1,
      mandatory: true,
    },
    {
      id: `${institutionId}:M-04`,
      code: 'M-04',
      title: 'Quarterly IAO meeting held',
      activity: 'Committee obligation',
      risk: 'All identified risks',
      completionCondition:
        'The Integrity Assurance Officers met during the quarter.',
      evidenceExpectation: 'Signed IAO minutes.',
      weight: 1,
      mandatory: true,
    },
  ];
}

/** Q1 baselines are approved; later quarters await officer approval (added in a later phase). */
export const initialBaselines: MockBaseline[] = institutions.flatMap(
  (institution) =>
    cycle.periods.map((period) => ({
      institutionId: institution.id,
      periodId: period.id,
      status:
        period.quarter === 1
          ? ('approved' as const)
          : ('pending_approval' as const),
      milestones: period.quarter === 1 ? q1Milestones(institution.id) : [],
    })),
);
