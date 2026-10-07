import type { PublishedResult } from '@cpi/contracts';

const quarter = (
  index: number,
  accepted: number,
  rejected: PublishedResult['evaluation']['quarters'][number]['rejected'] = [],
  late = false,
): PublishedResult['evaluation']['quarters'][number] => ({
  periodId: `SAMPLE-Q${index}`,
  periodLabel: `Q${index}`,
  status: 'finalized',
  implementation: { numerator: accepted, denominator: 4 },
  late,
  daysLate: late ? 3 : 0,
  daysLateUnit: 'calendar',
  firstSubmittedAt: `2026-${['10-12', '01-14', '04-17', '07-10'][index - 1]}T10:00:00+03:00`,
  firstCompleteEvidenceAt: null,
  revision: 1,
  reviewedBy: 'Prevention Officer (sample)',
  rejected,
  planSize: 4,
  note: null,
});

/**
 * A realistic, clearly fictional result for the branding preview (HP2-65): it shows how the
 * identity looks around real content before anything is saved or published.
 */
export const sampleEvaluation: PublishedResult['evaluation'] = {
  institutionId: 'DEMO-001',
  institutionName: 'Sample Institution (fictional)',
  officerName: 'Prevention Officer (sample)',
  weights: {
    procedures: 10,
    riskAssessment: 15,
    mitigationPlan: 15,
    implementation: 60,
  },
  foundations: [
    {
      kind: 'procedures',
      label: 'Procedures',
      score: {
        status: 'calculated',
        fraction: { numerator: 4, denominator: 4 },
        maxPoints: 10,
        points: '10.00',
      },
      versionId: null,
      failedChecks: [],
    },
    {
      kind: 'risk_assessment',
      label: 'Risk assessment',
      score: {
        status: 'calculated',
        fraction: { numerator: 3, denominator: 4 },
        maxPoints: 15,
        points: '11.25',
      },
      versionId: null,
      failedChecks: [
        {
          check: 'Probability and impact on the declared scale',
          reason: 'Two risks have no impact rating.',
        },
      ],
    },
    {
      kind: 'mitigation_plan',
      label: 'Mitigation plan',
      score: {
        status: 'calculated',
        fraction: { numerator: 4, denominator: 4 },
        maxPoints: 15,
        points: '15.00',
      },
      versionId: null,
      failedChecks: [],
    },
  ],
  quarters: [
    quarter(1, 4),
    quarter(2, 3, [
      {
        code: 'M-02',
        title: 'Gift register reviewed by the committee',
        reason: 'The minutes do not record the review.',
      },
    ]),
    quarter(3, 4, [], true),
    quarter(4, 4),
  ],
  total: {
    status: 'calculated',
    points: '92.50',
    implementationAverage: { numerator: 15, denominator: 16 },
    foundationPoints: '36.25',
    implementationPoints: '56.25',
  },
};
