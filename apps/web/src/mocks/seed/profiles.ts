import { foundationChecks, type ScoringProfile } from '@cpi/contracts';

/** A stored profile; `issues` is derived when the profile is read. */
export type MockProfile = Omit<ScoringProfile, 'issues'>;

const checklists = {
  procedures: [...foundationChecks.procedures],
  riskAssessment: [...foundationChecks.risk_assessment],
  mitigationPlan: [...foundationChecks.mitigation_plan],
};

/**
 * Hackathon Mock v1 is the one tested default profile (PRD §10.1). The published 23rd Cycle
 * structure is kept as a documented reference: it has not been validated as a scoring method,
 * so it can be copied but not applied as it stands.
 */
export const initialProfiles: MockProfile[] = [
  {
    id: 'hackathon-mock-v1',
    name: 'Hackathon Mock v1',
    version: 1,
    status: 'approved',
    weights: {
      procedures: 10,
      riskAssessment: 15,
      mitigationPlan: 15,
      implementation: 60,
    },
    proceduresMode: 'scored',
    checklists,
    formulaVersion: 'cpi-formula-1',
    rounding: 'half_up_2dp',
    simulation: true,
    sourceNote:
      'Proposed Demo Rubric v1 (PRD §10). Not an official EACC scoring method; organizer confirmation pending.',
    basedOn: null,
    createdAt: '2026-09-20T10:00:00+03:00',
    createdBy: 'Administrator',
    approvedAt: '2026-09-20T10:00:00+03:00',
    approvedBy: 'Administrator',
  },
  {
    id: 'cycle-23-reference',
    name: '23rd Cycle structure (reference)',
    version: 1,
    status: 'reference',
    weights: {
      procedures: 0,
      riskAssessment: 10,
      mitigationPlan: 10,
      implementation: 80,
    },
    proceduresMode: 'prerequisite',
    checklists,
    formulaVersion: 'cpi-formula-1',
    rounding: 'half_up_2dp',
    simulation: true,
    sourceNote:
      'Weights from the published 23rd Cycle structure, with procedures as a prerequisite (PRD §10.1). Kept for reference; matching weights do not make it an officially validated method.',
    basedOn: null,
    createdAt: '2026-09-20T10:00:00+03:00',
    createdBy: 'Administrator',
    approvedAt: null,
    approvedBy: null,
  },
];
