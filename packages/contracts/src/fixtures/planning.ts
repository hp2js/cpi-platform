import type { FoundationKind } from '../index.js';
import { institutions } from './cast.js';
import { plans } from './baselines.js';

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

export const approvedPlanReference =
  'Approved CRAMP FY 2026/27, CPC resolution of 14 Aug 2026 (fictional)';

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
  institutionId: string;
  kind: FoundationKind;
  versionId: string;
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
