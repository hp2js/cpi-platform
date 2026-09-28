import * as contracts from '@cpi/contracts';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integration, startApi, type Client } from './test/api';

/** As apps/web/src/features/events/queries.ts validates the demo email sink. */
const emailSinkSchema = z.array(
  z.object({
    id: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    deliveredAt: z.string(),
  }),
);

/**
 * Contract conformance: after the scripted year (so every kind of record exists), each read
 * the web app makes is validated with the same zod schema the web app uses. A shape the API
 * has drifted from fails here rather than in the browser.
 */
describe.skipIf(!integration)('responses match the contracts', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  const clients: Record<string, Client> = {};
  beforeAll(async () => {
    api = await startApi();
    await api.reset();
    await api.flushRedis();
    for (const id of [
      'administrator',
      'officer-a',
      'supervisor',
      'focal-demo-001',
    ])
      clients[id] = await api.client().signIn(id);
    const run = await clients.administrator!.post('/simulation/scenario');
    if (run.status !== 200) throw new Error(JSON.stringify(run.body));
  }, 180_000);
  afterAll(() => api?.stop());

  async function check(
    actor: string,
    path: string,
    schema: z.ZodType,
  ): Promise<unknown> {
    const result = await clients[actor]!.request(path);
    expect(result.status, `${actor} GET ${path}`).toBe(200);
    const parsed = schema.safeParse(result.body);
    expect(
      parsed.success ? [] : parsed.error.issues.slice(0, 5),
      `${actor} GET ${path} matches its contract`,
    ).toEqual([]);
    return result.body;
  }

  it('administrator reads', async () => {
    const admin = 'administrator';
    await check(admin, '/auth/config', contracts.authConfigSchema);
    await check(admin, '/demo/accounts', contracts.demoAccountsSchema);
    await check(admin, '/session', contracts.sessionSchema);
    await check(admin, '/account', contracts.accountSchema);
    await check(admin, '/cycles/current', contracts.cycleSchema);
    await check(admin, '/institutions', contracts.institutionsSchema);
    await check(admin, '/institutions/DEMO-001', contracts.institutionSchema);
    await check(admin, '/obligations', contracts.obligationsSchema);
    await check(admin, '/notifications', contracts.inboxSchema);
    await check(admin, '/settings/calendar', contracts.calendarSettingsSchema);
    await check(admin, '/settings/people', contracts.peopleSchema);
    await check(admin, '/settings/profiles', contracts.profilesStateSchema);
    await check(admin, '/simulation', contracts.simulationStateSchema);
    await check(admin, '/supervision', contracts.supervisionsSchema);
    await check(
      admin,
      '/assignment-suggestions',
      contracts.reassignmentSuggestionsSchema,
    );
    await check(admin, '/assignments', contracts.assignmentsSchema);
    await check(
      admin,
      '/assignments/history',
      contracts.assignmentHistorySchema,
    );
    await check(admin, '/forms', contracts.formVersionsSchema);
    await check(admin, '/forms/form-v1', contracts.formVersionSchema);
    await check(admin, '/annual', contracts.annualOverviewSchema);
    await check(admin, '/annual/report', contracts.consolidatedReportSchema);
    await check(admin, '/admin/attention', contracts.adminAttentionSchema);
    await check(admin, '/admin/email-sink', emailSinkSchema);
    await check(admin, '/admin/deliveries', contracts.deliveriesSchema);
    await check(admin, '/audit?pageSize=20', contracts.auditPageSchema);
    await check(admin, '/evidence', contracts.evidenceLookupSchema);
    await check(admin, '/oversight', contracts.oversightSchema);
    await check(admin, '/institutions/DEMO-004/plan', contracts.planSchema);
    await check(
      admin,
      '/institutions/DEMO-005/foundations',
      contracts.foundationsSchema,
    );
  });

  it('officer and supervisor reads', async () => {
    const queue = (await check(
      'officer-a',
      '/reviews?status=finalized',
      contracts.reviewQueueSchema,
    )) as contracts.ReviewQueueItem[];
    await check(
      'officer-a',
      '/reviews?status=open',
      contracts.reviewQueueSchema,
    );
    for (const item of queue.slice(0, 4))
      await check(
        'officer-a',
        `/reviews/${item.submissionId}`,
        contracts.reviewBundleSchema,
      );
    await check('officer-a', '/evidence', contracts.evidenceLookupSchema);
    await check('officer-a', '/account', contracts.accountSchema);
    await check('supervisor', '/oversight', contracts.oversightSchema);
    await check('supervisor', '/annual', contracts.annualOverviewSchema);
  });

  it('institution reads', async () => {
    const focal = 'focal-demo-001';
    await check(
      focal,
      '/institution-profile',
      contracts.institutionProfileSchema,
    );
    const receipts = (await check(
      focal,
      '/receipts',
      contracts.receiptsSchema,
    )) as contracts.Receipt[];
    await check(focal, `/receipts/${receipts[0]!.id}`, contracts.receiptSchema);
    await check(focal, '/results', contracts.institutionResultsSchema);
    for (const quarter of [1, 2, 3, 4]) {
      const path = `/obligations/${encodeURIComponent(`DEMO-001:FY2026-27-Q${quarter}`)}`;
      await check(focal, `${path}/report`, contracts.reportBundleSchema);
    }
    await check(focal, '/obligations', contracts.obligationsSchema);
    await check(
      focal,
      '/institutions/DEMO-001/foundations',
      contracts.foundationsSchema,
    );
  });
});
