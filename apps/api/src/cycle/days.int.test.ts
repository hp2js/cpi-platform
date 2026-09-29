import type {
  CalendarSettings,
  Obligation,
  Receipt,
  ReviewBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { systemState } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { completeDraft, publishSeedForm, submitDraft } from '../test/journeys';

/** Ported from apps/web/src/mocks/onboarding.test.ts (FR02, PRD §9.1). */
describe.skipIf(!integration)('enforcing working days', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    await api.flushRedis();
    admin = await api.client().signIn('administrator');
  });

  it('recalculates unopened deadlines, then counts lateness and windows in working days', async () => {
    const current = await admin.json<CalendarSettings>('/settings/calendar');
    const saved = (
      await admin.put('/settings/calendar', {
        deadlines: Object.fromEntries(
          current.periods.map((period) => [period.id, period.deadlineDate]),
        ),
        foundationDeadlineDate: current.foundationDeadlineDate,
        evaluationCutoffDate: current.evaluationCutoffDate,
        reminders: current.reminders,
        dayCounting: { ...current.dayCounting, mode: 'working' },
        applyRuleToDeadlines: true,
        reason: 'The organizer confirmed working days for this cycle.',
      })
    ).body as CalendarSettings;
    // Q1 has opened: its 15 October deadline stays.
    expect(saved.periods[0]!.deadlineDate).toBe('2026-10-15');
    // Q2: 15 working days after 31 Dec 2026, skipping 1 Jan and weekends.
    expect(saved.periods[1]!.deadlineDate).toBe('2027-01-22');
    expect(saved.ruleDeadlines['FY2026-27-Q2']).toBe('2027-01-22');
    expect(saved.changes[0]!.summary).toMatch(/calendar → working days/);

    // A report on Monday 19 Oct is two working days late (Fri 16, Mon 19).
    await publishSeedForm(admin);
    const focal = await api.client().signIn('focal-demo-001');
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await api.db
      .update(systemState)
      .set({ businessTime: '2026-10-19T10:00:00+03:00' });
    const receipt: Receipt = await submitDraft(
      focal,
      'DEMO-001',
      draft.version,
    );
    expect(receipt).toMatchObject({
      timeliness: 'late',
      daysLate: 2,
      daysLateUnit: 'working',
    });
    const [q1] = await focal.json<Obligation[]>('/obligations');
    expect(q1).toMatchObject({ daysLate: 2, daysLateUnit: 'working' });

    // A clarification asked on Mon 19 Oct runs 7 working days, past Mashujaa Day (Tue 20 Oct).
    const officer = await api.client().signIn('officer-a');
    const [item] = await officer.json<ReviewQueueItem[]>('/reviews');
    const asked = (
      await officer.post(`/reviews/${item!.submissionId}/clarifications`, {
        revision: 1,
        items: [
          {
            milestoneCode: null,
            question: 'Please send the signed IAO minutes.',
            requestedEvidence: '',
          },
        ],
      })
    ).body as ReviewBundle;
    expect(asked.clarifications[0]).toMatchObject({
      responseDueAt: '2026-10-29T23:59:59+03:00',
      windowDays: 7,
      windowUnit: 'working',
    });
  });
});
