import type { Milestone, ReportAnswers } from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { points, provisionalCredits, scoreSummary } from './scoring';

const milestone = (code: string): Milestone => ({
  id: `X:${code}`,
  code,
  title: code,
  activity: '',
  risk: '',
  activityId: null,
  completionCondition: '',
  evidenceExpectation: '',
  weight: 1,
  mandatory: false,
});
const milestones = ['M-01', 'M-02', 'M-03', 'M-04'].map(milestone);
const response = (
  completed: boolean | null,
  evidenceIds: string[] = [],
  unavailable = false,
) => ({
  completed,
  output: 'done',
  emergingIssues: '',
  actions: '',
  evidence: evidenceIds.map((evidenceId) => ({ evidenceId, passage: 'p. 2' })),
  evidenceUnavailable: unavailable
    ? { explanation: 'Minutes not yet signed' }
    : null,
});

describe('points', () => {
  it('rounds exactly and half-up to two decimals', () => {
    expect(points(60, { numerator: 3, denominator: 4 })).toBe('45.00');
    expect(points(60, { numerator: 13, denominator: 16 })).toBe('48.75');
    expect(points(15, { numerator: 1, denominator: 3 })).toBe('5.00');
    expect(points(10, { numerator: 1, denominator: 8 })).toBe('1.25');
    expect(points(1, { numerator: 1, denominator: 200 })).toBe('0.01');
  });
});

describe('provisional implementation credit (FR08)', () => {
  it('credits only claims supported by a supplied file', () => {
    const answers: ReportAnswers = {
      questions: {},
      milestones: {
        'X:M-01': response(true, ['ev-1']),
        'X:M-02': response(true, [], true),
        'X:M-03': response(false, ['ev-1']),
        'X:M-04': response(true, ['ev-missing']),
      },
    };
    expect(
      provisionalCredits(milestones, answers, ['ev-1']).map(
        (credit) => credit.basis,
      ),
    ).toEqual([
      'claimed_with_evidence',
      'claimed_evidence_unavailable',
      'not_claimed',
      'claimed_without_evidence',
    ]);
  });

  it('keeps the reviewed score pending until every milestone has a decision', () => {
    const answers: ReportAnswers = {
      questions: {},
      milestones: Object.fromEntries(
        milestones.map((m) => [m.id, response(true, ['ev-1'])]),
      ),
    };
    const decide = (code: string, outcome: 'accepted' | 'rejected') => ({
      milestoneId: `X:${code}`,
      outcome,
      reason: '',
      revision: 1,
      decidedBy: 'Officer',
      decidedAt: '2026-10-02T09:00:00+03:00',
      id: `dec-${code}`,
      carriedForwardFrom: null,
      supersededAt: null as string | null,
    });
    const partial = scoreSummary(
      60,
      milestones,
      answers,
      ['ev-1'],
      [decide('M-01', 'rejected')],
      1,
    );
    expect(partial.provisional).toMatchObject({
      status: 'calculated',
      points: '60.00',
    });
    expect(partial.reviewed).toMatchObject({
      status: 'pending',
      reason: 'awaiting_officer_decisions',
    });
    // Worked case (PRD §3.3): four claims, one unsupported → reviewed I1 = 3/4.
    const all = scoreSummary(
      60,
      milestones,
      answers,
      ['ev-1'],
      [
        decide('M-01', 'rejected'),
        decide('M-02', 'accepted'),
        decide('M-03', 'accepted'),
        decide('M-04', 'accepted'),
      ],
      1,
    );
    // A superseded decision never counts: only the active decision per milestone does.
    const superseded = {
      ...decide('M-01', 'accepted'),
      id: 'old',
      supersededAt: '2026-10-02T08:00:00+03:00',
    };
    const withHistory = scoreSummary(
      60,
      milestones,
      answers,
      ['ev-1'],
      [
        superseded,
        decide('M-01', 'rejected'),
        decide('M-02', 'accepted'),
        decide('M-03', 'accepted'),
        decide('M-04', 'accepted'),
      ],
      1,
    );
    expect(withHistory.reviewed).toMatchObject({
      status: 'calculated',
      points: '45.00',
    });
    expect(all.reviewed).toMatchObject({
      status: 'calculated',
      fraction: { numerator: 3, denominator: 4 },
      points: '45.00',
    });
  });
});
