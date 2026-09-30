import { desc } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { completeDraft, pdf, publishSeedForm } from '../test/journeys';

/** Ported from apps/web/src/mocks/files.test.ts (PRD §5.2, FR06). */
describe.skipIf(!integration)('who can open a file', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());

  const open = (client: Client, id: string) =>
    client.request(`/evidence/${id}/file`);
  const lastAudit = async () =>
    (
      await api.db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.seq))
        .limit(1)
    )[0];

  it('opens foundation documents for the institution and everyone reviewing it, and no one else', async () => {
    const procedures = 'ev-DEMO-001-procedures';
    for (const account of [
      'focal-demo-001',
      'officer-a',
      'supervisor',
      'administrator',
    ]) {
      const client = await api.client().signIn(account);
      const file = await open(client, procedures);
      expect(file.status, account).toBe(200);
      expect(file.headers.get('content-type')).toContain('application/pdf');
      expect(file.headers.get('x-demonstration-copy')).toBe('true');
      expect(file.headers.get('content-disposition')).toContain(
        "filename*=UTF-8''prevention-procedures-2026-demonstration.pdf",
      );
      expect(String(file.body)).toMatch(
        /^%PDF-1\.4[\s\S]*DEMONSTRATION COPY[\s\S]*%%EOF\n$/,
      );
    }
    expect(await lastAudit()).toMatchObject({
      action: 'evidence.access',
      summary: 'prevention-procedures-2026.pdf opened by an administrator',
    });
    for (const account of ['officer-b', 'focal-demo-002']) {
      const client = await api.client().signIn(account);
      expect((await open(client, procedures)).status, account).toBe(404);
    }
  });

  it('opens a draft’s files for an administrator only after an audited support view', async () => {
    const admin = await api.client().signIn('administrator');
    await publishSeedForm(admin);
    const focal = await api.client().signIn('focal-demo-003');
    const { upload } = await completeDraft(focal, 'DEMO-003');
    expect((await open(admin, upload.id)).status).toBe(404);
    await admin.post(
      `/support/obligations/${encodeURIComponent('DEMO-003:FY2026-27-Q1')}`,
      { reason: 'The focal person reports the draft will not save.' },
    );
    const file = await open(admin, upload.id);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-length')).toBe(
      String(pdf('minutes').byteLength),
    );
    expect((await lastAudit())?.summary).toBe(
      'cpc-minutes.pdf opened by an administrator during a support view',
    );
    // The support view is for administrators; officers still wait for submission.
    const officer = await api.client().signIn('officer-a');
    expect((await open(officer, upload.id)).status).toBe(404);
  });

  it('keeps the uploaded name, including characters outside ASCII, and downloads on request', async () => {
    await publishSeedForm(await api.client().signIn('administrator'));
    const focal = await api.client().signIn('focal-demo-001');
    const upload = (
      await focal.upload(
        '/obligations/DEMO-001%3AFY2026-27-Q1/evidence',
        { name: 'Minutes – Q1 “final”.pdf', bytes: pdf('minutes') },
        { category: 'cpc_minutes' },
      )
    ).body as { id: string };
    const inline = await open(focal, upload.id);
    expect(inline.headers.get('content-disposition')).toBe(
      `inline; filename="Minutes _ Q1 _final_.pdf"; filename*=UTF-8''${encodeURIComponent('Minutes – Q1 “final”.pdf')}`,
    );
    expect(inline.headers.get('x-demonstration-copy')).toBeNull();
    const saved = await focal.request(`/evidence/${upload.id}/file?download`);
    expect(saved.headers.get('content-disposition')).toMatch(/^attachment; /);
  });
});
