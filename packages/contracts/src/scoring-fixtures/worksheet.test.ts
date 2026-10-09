import { describe, expect, it } from 'vitest';
import {
  inputVersions,
  reviewedFixtures,
  scoringFixtures,
  scriptedYearCases,
} from './catalogue.js';
import {
  annualScore,
  calendarDaysLate,
  display2,
  effectiveVersion,
  foundationFraction,
  quarterFraction,
  ratio,
  worksheetResult,
  type Ratio,
} from './worksheet.js';

describe('HP2-11 independent worksheet', () => {
  it('is labelled Hackathon Mock v1 with the PRD §10.1 weights', () => {
    expect(inputVersions.profile.name).toBe('Hackathon Mock v1');
    expect(inputVersions.label).toMatch(/not official EACC scoring/);
    expect(inputVersions.weights).toEqual({
      procedures: 10,
      riskAssessment: 15,
      mitigationPlan: 15,
      implementation: 60,
    });
  });

  it('gives every fixture a stable, unique ID, a version and a PRD reference', () => {
    const ids = scoringFixtures.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of scoringFixtures) {
      expect(fixture.id).toMatch(/^SF-\d{2}$/);
      expect(fixture.version).toBeGreaterThan(0);
      expect(fixture.references.prd.length).toBeGreaterThan(0);
      expect(fixture.calculation.length).toBeGreaterThan(0);
      expect(fixture.workflow).not.toBe('');
    }
  });

  it.each(scoringFixtures.map((fixture) => [fixture.id, fixture] as const))(
    '%s: the hand-written expected result matches the independent calculation',
    (_, fixture) => {
      expect(worksheetResult(fixture)).toEqual(fixture.expected);
    },
  );

  it('keeps the 96.25 worked case separate from the 88.75 Example A fixture', () => {
    const exampleA = scoringFixtures.find((fixture) => fixture.id === 'SF-01')!;
    const worked = scoringFixtures.find((fixture) => fixture.id === 'SF-05')!;
    expect(exampleA.inputs).not.toEqual(worked.inputs);
    expect(exampleA.expected).toMatchObject({ total: '88.75' });
    expect(worked.expected).toMatchObject({ total: '96.25' });
  });

  it('covers every mandatory example from the checklist', () => {
    const totals = scoringFixtures.flatMap((fixture) =>
      'total' in fixture.expected ? [fixture.expected.total] : [],
    );
    expect(totals).toEqual(expect.arrayContaining(['88.75', '70.00', '96.25']));
  });
});

describe('worksheet arithmetic', () => {
  it('rounds half-up only at display', () => {
    expect(display2(ratio(45625, 1000))).toBe('45.63');
    expect(display2(ratio(45624, 1000))).toBe('45.62');
    expect(display2(ratio(1, 200))).toBe('0.01');
    expect(display2(ratio(1, 201))).toBe('0.00');
    expect(display2(ratio(45, 7))).toBe('6.43');
    expect(display2(ratio(100))).toBe('100.00');
  });

  it('refuses checklist and denominator values the PRD does not allow', () => {
    expect(() => foundationFraction(5)).toThrow();
    expect(() => foundationFraction(2.5)).toThrow();
    expect(quarterFraction(0, 0)).toBeNull();
    expect(() => quarterFraction(5, 4)).toThrow();
  });

  it('averages all four quarters with foundations once', () => {
    const one = ratio(1);
    const score = annualScore(
      inputVersions.weights,
      { procedures: one, riskAssessment: one, mitigationPlan: one },
      [ratio(1, 2), ratio(3, 4), one, one],
    );
    expect(display2(score.total)).toBe('88.75');
  });

  it('selects the foundation version effective at the cutoff, never a withdrawn one', () => {
    const versions = [
      {
        id: 'v1',
        status: 'withdrawn' as const,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
        acceptedChecks: 4,
      },
    ];
    expect(effectiveVersion(versions, '2027-07-31T23:59:59+03:00')).toBeNull();
    expect(() =>
      effectiveVersion(
        [
          { ...versions[0]!, status: 'active' },
          { ...versions[0]!, id: 'v2', status: 'active' },
        ],
        '2027-07-31T23:59:59+03:00',
      ),
    ).toThrow(/Conflicting/);
  });

  it('counts lateness in Nairobi calendar days', () => {
    const deadline = '2026-10-15T23:59:59+03:00';
    expect(calendarDaysLate(deadline, deadline)).toBe(0);
    expect(calendarDaysLate('2026-10-16T00:00:00+03:00', deadline)).toBe(1);
    expect(calendarDaysLate('2026-10-18T09:00:00+03:00', deadline)).toBe(3);
  });
});

describe('scripted demonstration year (PRD §17.1, consumed by HP2-36)', () => {
  // The totals HP2-36 reconciles against (docs/acceptance/annual-fixtures.json on that branch).
  const totals = {
    'DEMO-001': '88.75',
    'DEMO-002': '100.00',
    'DEMO-003': '100.00',
    'DEMO-004': '96.25',
    'DEMO-005': '70.00',
    'DEMO-006': '100.00',
    'DEMO-007': '100.00',
    'DEMO-008': '100.00',
  };

  it('covers the eight institutions once, with the expected totals', () => {
    const cases = scriptedYearCases();
    expect(cases.map((row) => row.institutionId)).toEqual(Object.keys(totals));
    expect(
      Object.fromEntries(
        cases.map((row) => [row.institutionId, row.expectedTotal]),
      ),
    ).toEqual(totals);
    expect(
      cases.find((row) => row.institutionId === 'DEMO-005')!.closedQuarters,
    ).toEqual([3]);
  });

  it.each(scriptedYearCases().map((row) => [row.institutionId, row] as const))(
    '%s: recomputes from its own checks and milestone counts',
    (_, row) => {
      const [p, r, m] = row.foundationAcceptedChecks.map(foundationFraction);
      const quarters = row.quarterAcceptedMilestones.map((accepted, index) =>
        row.closedQuarters.includes(index + 1)
          ? ratio(0)
          : quarterFraction(accepted, row.quarterLockedMilestones[index]!)!,
      ) as [Ratio, Ratio, Ratio, Ratio];
      const score = annualScore(
        inputVersions.weights,
        { procedures: p!, riskAssessment: r!, mitigationPlan: m! },
        quarters,
      );
      expect(display2(score.foundationPoints)).toBe(
        row.expectedFoundationPoints,
      );
      expect(display2(score.implementationPoints)).toBe(
        row.expectedImplementationPoints,
      );
      expect(display2(score.total)).toBe(row.expectedTotal);
    },
  );
});

describe('team review of inputs', () => {
  it('tracks which fixtures a later review agreed or reopened', () => {
    const review = (
      date: string,
      fixtures: string[],
      outcome: 'inputs_agreed' | 'changes_requested',
    ) => ({ reviewers: ['Reviewer'], date, fixtures, outcome, notes: '' });
    expect(reviewedFixtures([])).toEqual(new Set());
    expect(
      reviewedFixtures([
        review('2026-10-06', ['SF-02'], 'changes_requested'),
        review('2026-10-05', ['SF-01', 'SF-02'], 'inputs_agreed'),
      ]),
    ).toEqual(new Set(['SF-01']));
  });
});
