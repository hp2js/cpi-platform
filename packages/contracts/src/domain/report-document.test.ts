import { describe, expect, it } from 'vitest';
import type { PublishedResult } from '../draft/index.js';
import { defaultReportIdentity } from './identity.js';
import { institutionReportDocument } from './report-document.js';
import { renderPdf } from './report-pdf.js';

const quarter = (index: number, accepted: number, late = false) => ({
  periodId: `FY2026-27-Q${index}`,
  periodLabel: `Q${index}`,
  status: 'finalized' as const,
  implementation: { numerator: accepted, denominator: 4 },
  late,
  daysLate: late ? 3 : 0,
  daysLateUnit: 'calendar' as const,
  firstSubmittedAt: '2026-10-12T10:00:00+03:00',
  firstCompleteEvidenceAt: null,
  revision: 1,
  reviewedBy: 'Prevention Officer A',
  rejected:
    accepted < 4
      ? [
          {
            code: 'M-02',
            title: 'Exception review',
            reason: 'Not recorded in the minutes.',
          },
        ]
      : [],
  planSize: 4,
  note: null,
});

const result: PublishedResult = {
  id: 'pub-0001',
  institutionId: 'DEMO-001',
  institutionName: 'Demo Appointments Service Agency',
  version: 1,
  batchId: 'batch-1239',
  publishedAt: '2027-08-01T08:00:00+03:00',
  publishedBy: 'Administrator',
  status: 'current',
  supersededBy: null,
  correctionReason: null,
  profileName: 'Hackathon Mock v1',
  simulation: true,
  identity: defaultReportIdentity,
  evaluation: {
    institutionId: 'DEMO-001',
    institutionName: 'Demo Appointments Service Agency',
    officerName: 'Prevention Officer A',
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
          fraction: { numerator: 4, denominator: 4 },
          maxPoints: 15,
          points: '15.00',
        },
        versionId: null,
        failedChecks: [],
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
      quarter(1, 2),
      quarter(2, 3, true),
      quarter(3, 4),
      quarter(4, 4),
    ],
    total: {
      status: 'calculated',
      points: '88.75',
      implementationAverage: { numerator: 13, denominator: 16 },
      foundationPoints: '40.00',
      implementationPoints: '48.75',
    },
  },
};

const text = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

describe('annual report document (HP2-64)', () => {
  it('identifies itself, marks the simulation and is a tagged PDF with a text layer', () => {
    const generated = institutionReportDocument(result, {
      cycleLabel: 'FY 2026/27',
      generatedAt: '2027-08-02T09:00:00+03:00',
      images: {},
      supersededBy: null,
    });
    expect(generated.fileName).toBe('CPI-FY2026-27-DEMO-001-v1.pdf');
    const pdf = text(renderPdf(generated.document));
    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf).toContain('/StructTreeRoot');
    expect(pdf).toContain('/MarkInfo << /Marked true >>');
    expect(pdf).toContain('/Lang <FEFF0065006E002D00470042>');
    expect(pdf).toContain('/DisplayDocTitle true');
    expect(pdf).toContain('/S /TH');
    const pages = pdf.match(/\/Type \/Page /g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(1);
    for (let page = 1; page <= pages; page += 1)
      expect(pdf).toContain(`(Page ${page} of ${pages})`);
    expect(pdf.match(/\(Simulation: not official EACC scoring/g)?.length).toBe(
      pages * 2,
    );
    expect(pdf).toContain('(CPI-FY2026-27-DEMO-001-v1');
    expect(pdf).toContain('recorded in the minutes.');
    // The same version gives the same document, whenever it is generated.
    const again = institutionReportDocument(result, {
      cycleLabel: 'FY 2026/27',
      generatedAt: '2027-08-02T09:00:00+03:00',
      images: {},
      supersededBy: null,
    });
    expect(text(renderPdf(again.document))).toBe(pdf);
  });

  it('marks a superseded version on every page', () => {
    const generated = institutionReportDocument(result, {
      cycleLabel: 'FY 2026/27',
      generatedAt: '2027-08-02T09:00:00+03:00',
      images: {},
      supersededBy: {
        version: 2,
        publishedAt: '2027-08-03T09:00:00+03:00',
        reason: 'Q4 exception review was not done.',
      },
    });
    const pdf = text(renderPdf(generated.document));
    const pages = pdf.match(/\/Type \/Page /g)?.length ?? 0;
    expect(
      pdf.match(/\(Superseded by version 2 on /g)?.length,
    ).toBeGreaterThanOrEqual(pages * 2);
  });
});
