import type { ScoringProfile } from '@cpi/contracts';

export const statusLabel: Record<ScoringProfile['status'], string> = {
  draft: 'Draft',
  approved: 'Approved',
  reference: 'Reference only',
};

export function weightSummary(profile: ScoringProfile) {
  const { weights } = profile;
  return [
    profile.proceduresMode === 'prerequisite'
      ? 'Procedures: prerequisite'
      : `Procedures ${weights.procedures}`,
    `Risk assessment ${weights.riskAssessment}`,
    `Mitigation plan ${weights.mitigationPlan}`,
    `Implementation ${weights.implementation}`,
  ].join(' · ');
}
