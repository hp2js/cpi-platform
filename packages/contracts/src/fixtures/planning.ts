import type {
  Activity,
  FoundationKind,
  PlanApproval,
  PlannedMilestone,
} from '../index.js';
import { institutions } from './cast.js';
import { initialBaselines, plans } from './baselines.js';

export interface MockRisk {
  id: string;
  institutionId: string;
  code: string;
  description: string;
  cause: string;
  probability: number;
  impact: number;
}

export const initialRisks: MockRisk[] = institutions.flatMap(
  (institution, index) => {
    const plan = plans[institution.id]!;
    return [
      {
        id: `${institution.id}:R-01`,
        institutionId: institution.id,
        code: 'R-01',
        description: plan.risk.replace(/^R-01 /, ''),
        cause: 'Manual, discretionary process without an independent record.',
        probability: 3 + (index % 3),
        impact: 4,
      },
      {
        id: `${institution.id}:R-02`,
        institutionId: institution.id,
        code: 'R-02',
        description: 'Weak oversight of procurement approvals',
        cause: 'Approvals are not sampled or reviewed after the fact.',
        probability: 2 + (index % 2),
        impact: 3,
      },
    ];
  },
);

export type MockActivity = Activity & { institutionId: string };
export type MockPlannedMilestone = PlannedMilestone & { institutionId: string };
export type MockPlanApproval = PlanApproval & { institutionId: string };

/** The mitigation activities behind the seeded milestones, each linked to the risk it treats. */
export const initialActivities: MockActivity[] = institutions.flatMap(
  (institution) => {
    const plan = plans[institution.id]!;
    const activity = (
      code: string,
      risk: string,
      fields: Omit<Activity, 'id' | 'code' | 'riskId'>,
    ): MockActivity => ({
      id: `${institution.id}:${code}`,
      institutionId: institution.id,
      code,
      riskId: `${institution.id}:${risk}`,
      ...fields,
    });
    return [
      activity('A-01', 'R-01', {
        title: plan.activity.replace(/^A-01 /, ''),
        strategy: 'Replace discretion with a recorded, reviewable control.',
        output: plan.milestone,
        kpi: 'Share of cases handled through the control',
        target: '100% of cases from Q1',
        owner: 'Head of the affected function',
        resourceReference: 'Recurrent budget, integrity vote',
      }),
      activity('A-02', 'R-01', {
        title: 'Train staff in affected functions',
        strategy: 'Build awareness of the prevention procedure.',
        output: 'Staff trained',
        kpi: 'Staff trained as a share of those named in the plan',
        target: '90% by the end of Q1',
        owner: 'Human resources manager',
        resourceReference: 'Training budget',
      }),
      activity('A-03', 'R-02', {
        title: 'Spot-check procurement approvals',
        strategy: 'Sample approvals after the fact and act on findings.',
        output: 'Quarterly spot-check report',
        kpi: 'Approvals sampled each quarter',
        target: 'At least ten each quarter from Q2',
        owner: 'Internal audit',
        resourceReference: 'Internal audit work plan',
      }),
      ...(institution.id === 'DEMO-004'
        ? [
            activity('A-99', 'R-01', {
              title: 'Administrative tasks',
              strategy: 'Support the committee’s work.',
              output: 'Meetings arranged',
              kpi: 'Tasks done',
              target: 'All tasks',
              owner: 'Secretariat',
              resourceReference: '',
            }),
          ]
        : []),
    ];
  },
);

/** The quarter's plan is what its latest seeded baseline holds, less the committee meetings. */
export const initialPlannedMilestones: MockPlannedMilestone[] =
  initialBaselines.flatMap((baseline) =>
    baseline.milestones
      .filter((milestone) => milestone.activityId)
      .map((milestone) => ({
        id: milestone.id,
        institutionId: baseline.institutionId,
        code: milestone.code,
        activityId: milestone.activityId!,
        periodId: baseline.periodId,
        title: milestone.title,
        completionCondition: milestone.completionCondition,
        evidenceExpectation: milestone.evidenceExpectation,
      })),
  );

export const initialPlanApprovals: MockPlanApproval[] = institutions.map(
  (institution) => ({
    institutionId: institution.id,
    approvingBody: 'Corruption Prevention Committee',
    approvedOn: '2026-08-14',
    reference: 'CPC resolution 4/2026 (fictional)',
    accountingOfficer: institution.accountingOfficer?.name ?? '',
    documentVersionId: `fv-${institution.id}-mitigation_plan-1`,
    recordedBy: `Focal person, ${institution.id}`,
    recordedAt: '2026-09-20T11:00:00+03:00',
  }),
);

export interface MockFoundationVersion {
  id: string;
  institutionId: string;
  kind: FoundationKind;
  version: number;
  evidenceId: string;
  approvalReference: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'superseded' | 'withdrawn';
  recordedAt: string;
  claimedChecks: boolean[];
  withdrawnReason: string | null;
}

export interface MockFoundationReview {
  id: string;
  institutionId: string;
  kind: FoundationKind;
  /** Null for an unsupported disposition: no valid version covered the cutoff (AT28). */
  versionId: string | null;
  checks: { outcome: 'pass' | 'fail'; passage: string; reason: string }[];
  reviewedBy: string;
  reviewedAt: string;
}

const kinds: FoundationKind[] = [
  'procedures',
  'risk_assessment',
  'mitigation_plan',
];
const titles: Record<FoundationKind, string> = {
  procedures: 'prevention-procedures',
  risk_assessment: 'risk-assessment',
  mitigation_plan: 'mitigation-plan',
};

/** Synthetic foundation documents recorded before the 30 September deadline. */
export function seedFoundations() {
  const versions: MockFoundationVersion[] = [];
  const evidence: {
    id: string;
    institutionId: string;
    obligationId: string;
    category: FoundationKind;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    uploadedAt: string;
    uploadedBy: string;
    version: number;
    predecessorId: null;
    supersededBy: null;
  }[] = [];
  for (const institution of institutions) {
    for (const kind of kinds) {
      const evidenceId = `ev-${institution.id}-${kind}`;
      evidence.push({
        id: evidenceId,
        institutionId: institution.id,
        obligationId: `${institution.id}:foundations`,
        category: kind,
        fileName: `${titles[kind]}-2026.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 184_320,
        sha256: `${institution.id}${kind}`
          .split('')
          .map((char) => char.charCodeAt(0).toString(16))
          .join('')
          .padEnd(64, '0')
          .slice(0, 64),
        uploadedAt: '2026-09-20T11:00:00+03:00',
        uploadedBy: `Focal person, ${institution.id}`,
        version: 1,
        predecessorId: null,
        supersededBy: null,
      });
      versions.push({
        id: `fv-${institution.id}-${kind}-1`,
        institutionId: institution.id,
        kind,
        version: 1,
        evidenceId,
        approvalReference: 'CPC resolution of 14 Aug 2026 (fictional)',
        effectiveFrom: '2026-09-15',
        effectiveTo: null,
        status: 'active',
        recordedAt: '2026-09-20T11:00:00+03:00',
        // DEMO-005's risk assessment omits probability and impact scoring (PRD Example B: 0.75).
        claimedChecks:
          institution.id === 'DEMO-005' && kind === 'risk_assessment'
            ? [true, true, false, true]
            : [true, true, true, true],
        withdrawnReason: null,
      });
    }
  }
  return { versions, evidence };
}
