import { describe, expect, it } from 'vitest';
import { reopenEligibility } from './annual.js';
import { queueTiming } from './time.js';

describe('review queue timing (HP2-48)', () => {
  const base = {
    receivedAt: '2026-10-05T10:00:00+03:00',
    firstSubmittedAt: '2026-10-01T10:00:00+03:00',
    finalizedAt: null,
    reopenedAt: null,
    clarificationRequestedAt: null,
    now: '2026-10-15T10:00:00+03:00',
  };

  it('waits on the officer from receipt, and case age runs from first submission', () => {
    expect(queueTiming(base)).toEqual({
      waiting: { on: 'officer', since: base.receivedAt, days: 10 },
      caseDays: 14,
    });
  });

  it('waits on the institution while a clarification is open', () => {
    expect(
      queueTiming({
        ...base,
        clarificationRequestedAt: '2026-10-12T10:00:00+03:00',
      }).waiting,
    ).toEqual({
      on: 'institution',
      since: '2026-10-12T10:00:00+03:00',
      days: 3,
    });
  });

  it('restarts the officer wait at a reopening', () => {
    expect(
      queueTiming({ ...base, reopenedAt: '2026-10-14T10:00:00+03:00' }).waiting,
    ).toMatchObject({ on: 'officer', days: 1 });
  });

  it('stops counting at finalization, however much later it is read', () => {
    expect(
      queueTiming({
        ...base,
        finalizedAt: '2026-10-09T10:00:00+03:00',
        now: '2027-08-01T09:00:00+03:00',
      }),
    ).toEqual({ waiting: null, caseDays: 8 });
  });
});

describe('reopen eligibility (PRD §7.4, HP2-51)', () => {
  const base = {
    finalized: true,
    current: true,
    periodId: 'Q1',
    periodLabel: 'Q1',
    institutionId: 'DEMO-002',
    published: false,
    correction: null,
  };
  const caseFor = (periodId: string) => ({
    periodId,
    periodLabel: periodId,
    reason: 'Evidence was misread in the review.',
    openedBy: 'Administrator',
    openedAt: '2027-08-02T09:00:00+03:00',
  });

  it('allows an unpublished finalized review', () => {
    expect(reopenEligibility(base)).toMatchObject({
      allowed: true,
      reason: null,
    });
  });

  it('explains the correction case a published result needs', () => {
    expect(reopenEligibility({ ...base, published: true })).toMatchObject({
      allowed: false,
      reason:
        "DEMO-002's annual result is published. An administrator must open a correction case for Q1 before this review can be reopened.",
    });
  });

  it('names the quarter of a case opened for another quarter', () => {
    expect(
      reopenEligibility({ ...base, published: true, correction: caseFor('Q2') })
        .reason,
    ).toMatch(/is for Q2, not Q1/);
  });

  it('allows it with a matching case, and says which case', () => {
    expect(
      reopenEligibility({
        ...base,
        published: true,
        correction: caseFor('Q1'),
      }),
    ).toMatchObject({ allowed: true, correction: { periodId: 'Q1' } });
  });

  it('refuses a review that is not finalized or not the latest revision', () => {
    expect(reopenEligibility({ ...base, finalized: false }).allowed).toBe(
      false,
    );
    expect(reopenEligibility({ ...base, current: false }).allowed).toBe(false);
  });
});
