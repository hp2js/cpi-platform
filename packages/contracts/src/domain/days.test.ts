import { describe, expect, it } from 'vitest';
import { countDays, shiftDays } from './days.js';
import { daysLate, responseDueAt } from './time.js';

/** Ported from apps/web/src/mocks/onboarding.test.ts (PRD §9.1). */
const holidays = [{ date: '2026-10-20', name: 'Mashujaa Day' }];
const working = { mode: 'working' as const, holidays };
const calendar = { mode: 'calendar' as const, holidays };

describe('day counting (PRD §9.1)', () => {
  it('counts calendar days or working days without weekends and holidays', () => {
    // Fri 16 Oct 2026 + 3 working days skips the weekend and Mashujaa Day (Tue 20 Oct).
    expect(shiftDays('2026-10-16', 3, working)).toBe('2026-10-22');
    expect(shiftDays('2026-10-16', 3, calendar)).toBe('2026-10-19');
    expect(shiftDays('2026-10-22', -3, working)).toBe('2026-10-16');
    expect(countDays('2026-10-15', '2026-10-19', working)).toBe(2);
    expect(countDays('2026-10-15', '2026-10-19', calendar)).toBe(4);
    // The PRD §9.1 rule: 15 calendar days after 30 September is 15 October.
    expect(shiftDays('2026-09-30', 15, calendar)).toBe('2026-10-15');
  });

  it('counts lateness in the rule’s days: the last second is on time', () => {
    const deadline = '2026-10-15T23:59:59+03:00';
    expect(daysLate('2026-10-15T23:59:59+03:00', deadline, calendar)).toBe(0);
    expect(daysLate('2026-10-16T00:00:00+03:00', deadline, calendar)).toBe(1);
    // Monday 19 Oct is two working days late (Fri 16, Mon 19) and four calendar days.
    expect(daysLate('2026-10-19T10:00:00+03:00', deadline, working)).toBe(2);
    expect(daysLate('2026-10-19T10:00:00+03:00', deadline, calendar)).toBe(4);
  });

  it('gives calendar or working-day clarification windows', () => {
    const at = '2026-10-01T08:00:00+03:00';
    expect(responseDueAt(at, at, { ...calendar, clarificationDays: 7 })).toBe(
      '2026-10-08T23:59:59+03:00',
    );
    // Thu 1 Oct 2026 + 7 working days = Mon 12 Oct.
    expect(responseDueAt(at, at, { ...working, clarificationDays: 7 })).toBe(
      '2026-10-12T23:59:59+03:00',
    );
  });
});
