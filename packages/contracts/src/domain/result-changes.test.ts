import { describe, expect, it } from 'vitest';
import type { PublishedResult } from '../draft/index.js';
import { compareResults } from './annual.js';
import { defaultReportIdentity } from './identity.js';

const result = (
  version: number,
  q4: number,
  total: string,
): PublishedResult => ({
  id: `pub-${version}`,
  institutionId: 'DEMO-008',
  institutionName: 'Demo Land Records Office',
  version,
  batchId: `batch-${version}`,
  publishedAt: '2027-08-01T08:00:00+03:00',
  publishedBy: 'Administrator',
  status: version === 2 ? 'current' : 'superseded',
  supersededBy: version === 1 ? 'pub-2' : null,
  correctionReason: version === 2 ? 'Q4 exception review was not done.' : null,
  profileName: 'Hackathon Mock v1',
  simulation: true,
  identity: defaultReportIdentity,
  evaluation: {
    institutionId: 'DEMO-008',
    institutionName: 'Demo Land Records Office',
    officerName: 'Prevention Officer A',
    weights: {
      procedures: 10,
      riskAssessment: 15,
      mitigationPlan: 15,
      implementation: 60,
    },
    foundations: [],
    quarters: [1, 2, 3, 4].map((quarter) => ({
      periodId: `Q${quarter}`,
      periodLabel: `Q${quarter}`,
      status: 'finalized' as const,
      implementation: { numerator: quarter === 4 ? q4 : 4, denominator: 4 },
      late: false,
      daysLate: 0,
      daysLateUnit: 'calendar' as const,
      firstSubmittedAt: null,
      firstCompleteEvidenceAt: null,
      revision: 1,
      reviewedBy: 'Prevention Officer A',
      rejected: [],
      planSize: 4,
      note: null,
    })),
    total: {
      status: 'calculated',
      points: total,
      implementationAverage: { numerator: 12 + q4, denominator: 16 },
      foundationPoints: '40.00',
      implementationPoints: '60.00',
    },
  },
});

describe('what a correction changed (HP2-68)', () => {
  it('lists the total and each quarter that changed, before and after', () => {
    expect(
      compareResults(result(1, 4, '100.00'), result(2, 3, '96.25')),
    ).toEqual([
      { item: 'Annual result', before: '100.00 / 100', after: '96.25 / 100' },
      {
        item: 'Q4',
        before: '15.00 (4 of 4 milestones)',
        after: '11.25 (3 of 4 milestones)',
      },
    ]);
  });

  it('says nothing changed when the figures are the same', () => {
    expect(
      compareResults(result(1, 4, '100.00'), result(2, 4, '100.00')),
    ).toEqual([]);
  });
});
