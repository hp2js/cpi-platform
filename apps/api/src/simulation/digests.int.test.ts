import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notifications } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { completeDraft, publishSeedForm, submitDraft } from '../test/journeys';

/**
 * Ported from the digest tests in apps/web/src/mocks/officers.test.ts, supervision.test.ts and
 * plans.test.ts (PRD §4.1, G4, FR04).
 */
describe.skipIf(!integration)('digests', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    admin = await api.client().signIn('administrator');
  });

  const advance = (boundaryId: string) =>
    admin.post('/simulation/advance', { boundaryId });
  const digests = (recipientId: string, eventType: string) =>
    api.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          eq(notifications.eventType, eventType),
        ),
      )
      .orderBy(desc(notifications.createdAt));

  it('tells officers which baselines to approve and seeds to confirm', async () => {
    await advance('Q1-reminder-7');
    const [digest] = await digests('officer-a', 'review.digest');
    expect(digest?.body).toMatch(
      /4 baselines need your approval before the quarter opens; 4 seeded baselines need confirming/,
    );
    expect(digest?.link).toBe('/officer');
  });

  it('escalates quarters under way without an approved baseline to the supervisor, once per move', async () => {
    await advance('Q1-reminder-7');
    const [digest] = await digests('supervisor', 'oversight.digest');
    expect(digest?.body).toMatch(
      /8 quarters have started without an approved baseline \(DEMO-001 Q2, DEMO-002 Q2, DEMO-003 Q2, …\)/,
    );
    // A move that crosses no new boundary sends nothing more.
    await advance('Q1-reminder-7');
    expect(await digests('supervisor', 'oversight.digest')).toHaveLength(1);
  });

  it('flags reports missing after the deadline and reviews past the target', async () => {
    await publishSeedForm(admin);
    const focal = await api.client().signIn('focal-demo-001');
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    // Received 1 Oct; the 10-day target ends 11 Oct. The Q1 deadline passes on 15 Oct.
    await advance('Q1-overdue');
    const [digest] = await digests('supervisor', 'oversight.digest');
    expect(digest?.body).toMatch(
      /7 reports missing after the deadline; 1 review past the officer review target/,
    );
  });
});
