import { count, eq, inArray } from 'drizzle-orm';
import type {
  AnnualOverview,
  AuditPage,
  CalendarSettings,
  Delivery,
  Inbox,
  InstitutionResults,
  Oversight,
  ProfilesState,
  ReviewQueueItem,
  ScenarioResult,
  ScoringProfile,
  SimulationState,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deliveries,
  emailSink,
  notifications,
  processedEvents,
  systemState,
  users,
} from '../database/schema';
import { loadConfig } from '../config';
import { lockWrites, write } from '../database/db';
import { Events } from '../events/events';
import { integration, startApi, type Client } from '../test/api';
import { completeDraft, publishSeedForm, submitDraft } from '../test/journeys';

const expected: Record<string, string> = {
  'DEMO-001': '88.75', // Example A
  'DEMO-002': '100.00', // missing evidence corrected through clarification
  'DEMO-003': '100.00', // late, with no invented penalty (Example E)
  'DEMO-004': '96.25', // worked case §3.3
  'DEMO-005': '70.00', // Example B: Q3 closed, partial risk assessment
  'DEMO-006': '100.00', // amendment
  'DEMO-007': '100.00', // wrong-period evidence replaced
  'DEMO-008': '100.00', // reassigned
};

/** Ported from apps/web/src/mocks/annual.test.ts, settings.test.ts and safeguards.test.ts. */
describe.skipIf(!integration)(
  'simulation, events and the scripted year',
  () => {
    let api: Awaited<ReturnType<typeof startApi>>;
    let admin: Client;
    beforeAll(async () => {
      // Retries without backoff, so failures reach the queue within a poll or two.
      api = await startApi({ DELIVERY_RETRY_DELAYS_MS: '0,0' });
    }, 60_000);
    afterAll(() => api?.stop());
    beforeEach(async () => {
      await api.reset();
      admin = await api.client().signIn('administrator');
    });

    /** Waits for the delivery worker to finish every queued or retrying email. */
    async function deliveriesSettled() {
      await expect
        .poll(
          async () =>
            (await admin.json<Delivery[]>('/admin/deliveries')).filter(
              (delivery) =>
                delivery.status === 'queued' || delivery.status === 'retrying',
            ).length,
          { timeout: 10_000 },
        )
        .toBe(0);
    }

    async function runYear() {
      const result = await admin.post('/simulation/scenario');
      if (result.status !== 200)
        throw new Error(`Scenario failed: ${JSON.stringify(result.body)}`);
      return result.body as ScenarioResult;
    }
    const byId = (overview: AnnualOverview, id: string) =>
      overview.institutions.find((row) => row.institutionId === id)!;

    it(
      'reproduces every expected annual result and stays pending until publication (PRD §17, AT18, AT19)',
      { timeout: 120_000 },
      async () => {
        const result = await runYear();
        expect(result.steps.length).toBeGreaterThan(20);
        expect(result.businessTime).toBe('2027-08-01T08:00:00+03:00');
        const overview = await admin.json<AnnualOverview>('/annual');
        expect(overview.cutoffPassed).toBe(true);
        expect(
          Object.fromEntries(
            overview.institutions.map((evaluation) => [
              evaluation.institutionId,
              evaluation.total.status === 'calculated'
                ? evaluation.total.points
                : evaluation.total.reasons.join('; '),
            ]),
          ),
        ).toEqual(expected);
        expect(
          byId(overview, 'DEMO-005').quarters.map((quarter) => quarter.status),
        ).toEqual([
          'finalized',
          'finalized',
          'closed_without_submission',
          'finalized',
        ]);
        expect(
          byId(overview, 'DEMO-003').quarters.map((quarter) => quarter.late),
        ).toEqual([false, true, false, false]);
        expect(
          byId(overview, 'DEMO-008').quarters.map(
            (quarter) => quarter.reviewedBy,
          ),
        ).toEqual([
          'Prevention Officer B',
          'Prevention Officer B',
          'Prevention Officer A',
          'Prevention Officer A',
        ]);

        // Nothing numerical reaches an institution before release (AT18).
        const focal1 = await api.client().signIn('focal-demo-001');
        expect(await focal1.json<InstitutionResults>('/results')).toMatchObject(
          {
            released: false,
            results: [],
          },
        );
        expect((await focal1.request('/annual')).status).toBe(403);

        // Publication of a ready batch (AT19); only the entity's own result is visible.
        expect(
          (
            await admin.post('/annual/publish', {
              institutionIds: Object.keys(expected),
            })
          ).status,
        ).toBe(200);
        const focal4 = await api.client().signIn('focal-demo-004');
        const released = await focal4.json<InstitutionResults>('/results');
        expect(released.results).toHaveLength(1);
        expect(released.results[0]).toMatchObject({
          institutionId: 'DEMO-004',
          status: 'current',
          version: 1,
          evaluation: { total: { points: '96.25' } },
        });
        expect(JSON.stringify(released)).not.toContain('DEMO-001');
      },
    );

    it(
      'corrects a published result through a case, preserving the superseded release (AT20)',
      { timeout: 120_000 },
      async () => {
        await runYear();
        await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] });
        // Without a case the officer cannot reopen a published quarter.
        const officer = await api.client().signIn('officer-a');
        const q4 = (
          await officer.json<ReviewQueueItem[]>('/reviews?status=finalized')
        ).find(
          (item) =>
            item.institutionId === 'DEMO-008' && item.periodLabel === 'Q4',
        )!;
        const path = `/reviews/${q4.submissionId}`;
        expect(
          await officer.post(`${path}/reopen`, {
            reason: 'Correction needed for M-13.',
          }),
        ).toMatchObject({ status: 409, body: { code: 'correction_required' } });
        await admin.post('/annual/corrections', {
          institutionId: 'DEMO-008',
          periodId: 'FY2026-27-Q4',
          reason: 'Later evidence shows the Q4 exception review was not done.',
        });
        await officer.post(`${path}/reopen`, {
          reason: 'Correction case: Q4 exception review not done.',
        });
        await officer.put(`${path}/decisions/M-13`, {
          outcome: 'rejected',
          reason: 'Exception review was not completed in Q4.',
          revision: 1,
        });
        await officer.post(`${path}/finalize`, { revision: 1 });
        const after = (
          await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] })
        ).body as AnnualOverview;
        // 40 + 60 × (1 + 1 + 1 + 0.75) ÷ 4
        expect(byId(after, 'DEMO-008').publication).toMatchObject({
          version: 2,
          points: '96.25',
          stale: false,
        });
        const focal = await api.client().signIn('focal-demo-008');
        const results = await focal.json<InstitutionResults>('/results');
        expect(
          results.results.map((result) => [result.version, result.status]),
        ).toEqual([
          [2, 'current'],
          [1, 'superseded'],
        ]);
        expect(results.results[0]?.correctionReason).toMatch(
          /exception review/,
        );
      },
    );

    it(
      'reports oversight metrics with explicit denominators (PRD §4.3)',
      { timeout: 120_000 },
      async () => {
        await runYear();
        const supervisor = await api.client().signIn('supervisor');
        const oversight = await supervisor.json<Oversight>('/oversight');
        const metrics = Object.fromEntries(
          oversight.metrics.map((metric) => [metric.id, metric]),
        );
        expect(metrics['submission-coverage']).toMatchObject({
          numerator: 31,
          denominator: 32,
        });
        expect(metrics['on-time']).toMatchObject({
          numerator: 30,
          denominator: 32,
        });
        expect(metrics['release-coverage']).toMatchObject({
          numerator: 0,
          denominator: 8,
          percent: 0,
        });
        expect(oversight.backlog.closedNonresponse).toBe(1);
        const filtered = await supervisor.json<Oversight>(
          '/oversight?periodId=FY2026-27-Q3&officerId=officer-b',
        );
        expect(
          filtered.metrics.find(
            (metric) => metric.id === 'submission-coverage',
          ),
        ).toMatchObject({ numerator: 2, denominator: 3 });
      },
    );

    it('replays of clock boundaries create nothing new (AT13)', async () => {
      const advance = (boundaryId: string) =>
        admin.post('/simulation/advance', { boundaryId });
      await advance('Q2-overdue');
      const counted = async () => [
        (await api.db.select({ n: count() }).from(notifications))[0]!.n,
        (await api.db.select({ n: count() }).from(processedEvents))[0]!.n,
      ];
      const before = await counted();
      expect(before[1]).toBeGreaterThan(0);
      await advance('Q2-overdue');
      await advance('Q1-reminder-7');
      expect(await counted()).toEqual(before);
      expect((await advance('no-such-boundary')).status).toBe(404);

      const focal = await api.client().signIn('focal-demo-001');
      const inbox = await focal.json<Inbox>('/notifications');
      expect(
        inbox.items
          .filter((item) => item.eventType === 'deadline.overdue')
          .map((item) => item.title),
      ).toEqual(['Q2 report overdue: DEMO-001', 'Q1 report overdue: DEMO-001']);
      // Each notice carries the time its boundary occurred and a link to the report.
      expect(
        inbox.items.find(
          (item) => item.title === 'Q1 report overdue: DEMO-001',
        ),
      ).toMatchObject({
        createdAt: '2026-10-16T00:00:00+03:00',
        link: '/institution/reports/FY2026-27-Q1',
      });
      expect(inbox.unread).toBe(inbox.items.length);
      expect(
        (
          await focal.request(`/notifications/${inbox.items[0]!.id}/read`, {
            method: 'POST',
          })
        ).status,
      ).toBe(204);
      await focal.post('/notifications/read-all');
      expect((await focal.json<Inbox>('/notifications')).unread).toBe(0);
      const state = await focal.json<SimulationState>('/simulation');
      expect(state.businessTime).toBe(
        state.boundaries.find((b) => b.id === 'Q2-overdue')!.at,
      );
    });

    it('routes events to authorized recipients and surfaces failed email for retry (FR11, AT12)', async () => {
      await api.db.update(systemState).set({ emailFailureMode: true });
      await publishSeedForm(admin);
      const focal = await api.client().signIn('focal-demo-001');
      const { draft } = await completeDraft(focal, 'DEMO-001');
      await submitDraft(focal, 'DEMO-001', draft.version);
      const officer = await api.client().signIn('officer-a');
      expect(
        (await officer.json<Inbox>('/notifications')).items.map(
          (item) => item.eventType,
        ),
      ).toContain('submission.received');
      const other = await api.client().signIn('officer-b');
      expect(
        (await other.json<Inbox>('/notifications')).items.map(
          (item) => item.eventType,
        ),
      ).not.toContain('submission.received');

      await deliveriesSettled();
      const failed = await admin.json<Delivery[]>(
        '/admin/deliveries?status=failed',
      );
      expect(failed.length).toBeGreaterThan(0);
      expect(failed[0]).toMatchObject({ attempts: 3, status: 'failed' });
      await api.db.update(systemState).set({ emailFailureMode: false });
      expect(
        await admin.post(`/admin/deliveries/${failed[0]!.id}/retry`),
      ).toMatchObject({ status: 200, body: { status: 'delivered' } });
      const all = await admin.json<Delivery[]>('/admin/deliveries');
      expect(
        all.find((delivery) => delivery.id === failed[0]!.id)?.status,
      ).toBe('delivered');
      // The submission itself was never undone by email failure (FR07).
      expect(await admin.json<unknown[]>('/admin/email-sink')).toHaveLength(1);
      const { events } = await admin.json<AuditPage>('/audit?pageSize=200');
      expect(events.map((event) => event.action)).toEqual(
        expect.arrayContaining([
          'form.publish',
          'evidence.upload',
          'submission.submit',
          'delivery.retry',
        ]),
      );
      expect((await officer.request('/audit')).status).toBe(403);
      expect((await officer.request('/audit.csv')).status).toBe(403);
    });

    it('delivers outside the business transaction and resumes rows an interrupted worker left (HP2-43)', async () => {
      await api.db.update(systemState).set({ emailFailureMode: true });
      await publishSeedForm(admin);
      await deliveriesSettled();
      // Every delivery failed, yet the publication stands.
      const all = await admin.json<Delivery[]>('/admin/deliveries');
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((delivery) => delivery.status === 'failed')).toBe(true);
      expect(
        (await admin.json<{ status: string }>('/forms/form-v1')).status,
      ).toBe('published');

      // A worker that stopped mid-retry leaves the row retrying; the next poll finishes it once.
      await api.db
        .update(deliveries)
        .set({ status: 'retrying', attempts: 1, nextAttemptAt: null })
        .where(eq(deliveries.id, all[0]!.id));
      await api.db.update(systemState).set({ emailFailureMode: false });
      await deliveriesSettled();
      expect(
        (await admin.json<Delivery[]>('/admin/deliveries')).find(
          (delivery) => delivery.id === all[0]!.id,
        ),
      ).toMatchObject({ status: 'delivered', attempts: 2 });
      expect(await admin.json<unknown[]>('/admin/email-sink')).toHaveLength(1);
    });

    it('delivers committed work after a crash and replays an event without a second message (HP2-43)', async () => {
      const events = new Events(loadConfig(process.env));
      const recipients = await api.db
        .select()
        .from(users)
        .where(inArray(users.id, ['officer-a', 'focal-demo-001']));
      const notify = () =>
        write(api.db, (tx, businessTime) =>
          events.notify(
            tx,
            businessTime,
            'test.restart',
            'test.restart',
            recipients,
            {
              title: 'Restart check',
              body: 'Queued while the API was down.',
              link: null,
            },
          ),
        );
      const sink = async () =>
        (await api.db.select().from(emailSink)).filter(
          (mail) => mail.subject === 'Restart check',
        );

      // The API crashes; meanwhile a committed change queues two deliveries, and is replayed.
      await api.kill();
      await notify();
      await notify(); // the replay queues nothing more
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const queued = await api.db
        .select()
        .from(deliveries)
        .where(eq(deliveries.eventType, 'test.restart'));
      expect(queued.map((row) => row.status)).toEqual(['queued', 'queued']);

      // The restarted worker finds the committed rows and delivers each once.
      await api.start();
      await deliveriesSettled();
      expect(await sink()).toHaveLength(2);
      await notify();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await sink()).toHaveLength(2);
    });

    it('refuses simulation controls to everyone but administrators, changing nothing', async () => {
      const records = async () => ({
        state: (await api.db.select().from(systemState))[0],
        events: (await api.db.select({ n: count() }).from(processedEvents))[0],
      });
      const before = await records();
      for (const account of ['officer-a', 'supervisor', 'focal-demo-001']) {
        const client = await api.client().signIn(account);
        for (const [path, body] of [
          ['/simulation/advance', { boundaryId: 'Q1-open' }],
          ['/simulation/reset', undefined],
          ['/simulation/scenario', undefined],
        ] as const)
          expect((await client.post(path, body)).status).toBe(403);
      }
      expect(await records()).toEqual(before);
      expect(await admin.json<SimulationState>('/simulation')).toMatchObject({
        controls: true,
        blockedBy: null,
      });
    });

    it('starts a new run only after a write in progress commits, and records it (HP2-42)', async () => {
      let reset: Awaited<ReturnType<Client['post']>> | undefined;
      await api.db.transaction(async (tx) => {
        await lockWrites(tx); // A write in progress holds the write lock.
        const pending = admin.post('/simulation/reset').then((result) => {
          reset = result;
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(reset).toBeUndefined();
        void pending;
      });
      await expect.poll(() => reset?.status, { timeout: 10_000 }).toBe(200);
      const { events } = await admin.json<AuditPage>(
        '/audit?action=simulation.reset',
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.summary).toMatch(/^Started run-002, replacing run-001/);
    });

    it('tries a different profile in a new run and keeps the profile library (PRD §7.1, AT24)', async () => {
      const draft = (
        await admin.post('/settings/profiles', { basedOn: 'hackathon-mock-v1' })
      ).body as ScoringProfile;
      await admin.put(`/settings/profiles/${draft.id}`, {
        name: 'Heavier implementation',
        weights: {
          procedures: 10,
          riskAssessment: 10,
          mitigationPlan: 10,
          implementation: 70,
        },
        proceduresMode: 'scored',
        checklists: draft.checklists,
        sourceNote: 'Test profile.',
      });
      await admin.post(`/settings/profiles/${draft.id}/approve`);
      await publishSeedForm(admin);
      expect(
        await admin.post('/simulation/reset', {
          profileId: 'cycle-23-reference',
        }),
      ).toMatchObject({ status: 409, body: { code: 'profile_not_approved' } });
      const run = (
        await admin.post('/simulation/reset', { profileId: draft.id })
      ).body as SimulationState;
      expect(run).toMatchObject({
        runId: 'run-002',
        businessTime: '2026-10-01T08:00:00+03:00',
      });
      const state = await admin.json<ProfilesState>('/settings/profiles');
      expect(state.cycleProfileId).toBe(draft.id);
      expect(state.locked).toBe(false);
      expect(state.profiles.map((profile) => profile.id)).toContain(draft.id);
      // The administrator's session survives the new run.
      expect((await admin.request('/session')).status).toBe(200);
    });

    it('adds a reminder for future deadlines without sending past ones late (FR02)', async () => {
      const current = await admin.json<CalendarSettings>('/settings/calendar');
      await admin.put('/settings/calendar', {
        deadlines: Object.fromEntries(
          current.periods.map((period) => [period.id, period.deadlineDate]),
        ),
        foundationDeadlineDate: current.foundationDeadlineDate,
        evaluationCutoffDate: current.evaluationCutoffDate,
        reminders: { daysBefore: [14, 7, 1], overdueNotice: true },
        dayCounting: current.dayCounting,
        applyRuleToDeadlines: false,
        reason: 'Institutions asked for an earlier reminder.',
      });
      const state = await admin.json<SimulationState>('/simulation');
      expect(state.boundaries.map((boundary) => boundary.id)).toContain(
        'Q2-reminder-14',
      );
    });

    it('moves access at once and keeps the earlier reviewer in the history (AT22)', async () => {
      expect(
        await admin.post('/assignments', {
          institutionId: 'DEMO-005',
          officerId: 'officer-b',
          reason: 'Already assigned to Officer B.',
        }),
      ).toMatchObject({ status: 409, body: { code: 'no_change' } });
      // A session opened before the reassignment loses access on its next request.
      const before = await api.client().signIn('officer-b');
      expect((await before.request('/institutions/DEMO-005')).status).toBe(200);
      await admin.post('/assignments', {
        institutionId: 'DEMO-005',
        officerId: 'officer-a',
        reason: 'Balancing portfolios for Q2.',
      });
      const history = await admin.json<
        { institutionId: string; officerId: string }[]
      >('/assignments/history');
      expect(
        history
          .filter((row) => row.institutionId === 'DEMO-005')
          .map((row) => row.officerId),
      ).toEqual(['officer-b', 'officer-a']);
      expect((await before.request('/institutions/DEMO-005')).status).toBe(404);
      expect(
        (await before.request('/obligations?institutionId=DEMO-005')).status,
      ).toBe(404);
      expect(
        (
          await before.json<{ institutionId: string }[]>(
            '/evidence?institutionId=DEMO-005',
          )
        ).length,
      ).toBe(0);
      const after = await api.client().signIn('officer-a');
      expect((await after.request('/institutions/DEMO-005')).status).toBe(200);
    });
  },
);
