import type { FormVersion } from '../index.js';
import { cycle } from './cycle.js';

/**
 * Quarterly progress form v1, seeded as an unpublished draft: the demonstration begins with
 * the administrator publishing it (PRD §17.2). Weights are the Hackathon Mock v1 profile.
 */
export const initialForm: FormVersion = {
  id: 'form-v1',
  cycleId: cycle.id,
  version: 1,
  title: 'Quarterly corruption prevention progress report',
  status: 'draft',
  publishedAt: null,
  periodIds: cycle.periods.map((period) => period.id),
  weights: {
    procedures: 10,
    riskAssessment: 15,
    mitigationPlan: 15,
    implementation: 60,
  },
  weightsLocked: false,
  basedOnVersion: null,
  updatedAt: '2026-09-20T10:00:00+03:00',
  revision: 0,
  changes: [],
  sections: [
    {
      id: 'committee-minutes',
      title: 'Committee minutes',
      description:
        'The cycle guidelines ask for signed Corruption Prevention Committee (CPC) and Integrity Assurance Officer (IAO) minutes with each quarterly report. The same minutes can support several milestones.',
      questions: [
        {
          id: 'cpc-minutes',
          label: 'Signed CPC meeting minutes for the quarter',
          help: 'Upload the signed minutes, or declare that they are not available and explain why.',
          type: 'evidence',
          required: true,
          kind: 'informational',
          evidenceCategory: 'cpc_minutes',
        },
        {
          id: 'iao-minutes',
          label: 'Signed IAO meeting minutes for the quarter',
          help: 'Upload the signed minutes, or declare that they are not available and explain why.',
          type: 'evidence',
          required: true,
          kind: 'informational',
          evidenceCategory: 'iao_minutes',
        },
      ],
    },
    {
      id: 'milestone-progress',
      title: 'Progress against planned milestones',
      description:
        'Report on each milestone in your approved baseline for this quarter. Say honestly if a milestone was not completed or its evidence is not available; this is submittable and is not treated as an error.',
      questions: [
        {
          id: 'milestones',
          label: 'Milestones due this quarter',
          type: 'milestone_progress',
          required: true,
          kind: 'scored',
        },
      ],
    },
    {
      id: 'issues-and-remarks',
      title: 'Emerging issues and remarks',
      questions: [
        {
          id: 'emerging-issues',
          label: 'Emerging issues across the quarter',
          help: 'Challenges that affected corruption prevention work, beyond individual milestones.',
          type: 'long_text',
          required: true,
          kind: 'informational',
        },
        {
          id: 'actions-planned',
          label: 'Actions to address the issues',
          type: 'long_text',
          required: true,
          kind: 'informational',
        },
        {
          id: 'remarks',
          label: 'Other remarks',
          type: 'long_text',
          required: false,
          kind: 'informational',
        },
      ],
    },
  ],
};
