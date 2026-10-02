import { eq } from 'drizzle-orm';
import type {
  Completeness,
  EvidenceItem,
  Receipt,
  ReportBundle,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, notifications, systemState } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  attestation,
  completeDraft,
  obligationPath,
  pdf,
  publishSeedForm,
  submitDraft,
} from '../test/journeys';

/** Ported from apps/web/src/mocks/thin-path.test.ts and acceptance.test.ts (AT06–AT07, AT11, AT21, AT26). */
describe.skipIf(!integration)('institution reporting', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let focal: Client;
  const path = obligationPath('DEMO-001');
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    focal = await api.client().signIn('focal-demo-001');
  });
  const published = async () =>
    publishSeedForm(await api.client().signIn('administrator'));
  const setBusinessTime = (businessTime: string) =>
    api.db.update(systemState).set({ businessTime });

  it('keeps the report closed until a form is published', async () => {
    const bundle = await focal.json<ReportBundle>(`${path}/report`);
    expect(bundle.form).toBeNull();
    expect(bundle.submitted).toBeNull();
    expect(bundle.editable).toBe(false);
    expect(bundle.baseline.status).toBe('approved');
  });

  it('keeps drafts private to the institution', async () => {
    await published();
    const other = await api.client().signIn('focal-demo-002');
    expect((await other.request(`${path}/report`)).status).toBe(404);
    const officer = await api.client().signIn('officer-a');
    expect((await officer.request(`${path}/report`)).status).toBe(403);
  });

  it('rejects a disguised executable (AT21)', async () => {
    await published();
    const result = await focal.upload(
      `${path}/evidence`,
      { name: 'minutes.pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) },
      { category: 'cpc_minutes' },
    );
    expect(result).toMatchObject({
      status: 422,
      body: {
        code: 'upload_rejected',
        fieldErrors: { file: expect.stringContaining('do not match') },
      },
    });
  });

  it('stores uploads privately, deduplicates retries and versions replacements', async () => {
    await published();
    const upload = (name: string, text: string, replaces?: string) =>
      focal.upload(
        `${path}/evidence`,
        { name, bytes: pdf(text) },
        { category: 'cpc_minutes', ...(replaces ? { replaces } : {}) },
      );
    const first = await upload('cpc-minutes.pdf', 'v1');
    expect(first.status).toBe(201);
    const item = first.body as EvidenceItem;
    expect(item).toMatchObject({ version: 1, mimeType: 'application/pdf' });
    const retry = await upload('cpc-minutes.pdf', 'v1');
    expect(retry).toMatchObject({ status: 200, body: { id: item.id } });
    const replaced = (await upload('cpc-minutes (signed).pdf', 'v2', item.id))
      .body as EvidenceItem;
    expect(replaced).toMatchObject({ version: 2, predecessorId: item.id });

    const file = await focal.request(`/evidence/${replaced.id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.body).toContain('v2');
    // Not submitted yet, so a reviewer cannot open it.
    const officer = await api.client().signIn('officer-a');
    expect(
      (await officer.request(`/evidence/${replaced.id}/file`)).status,
    ).toBe(404);
  });

  it('refuses a stale draft save (version conflict)', async () => {
    await published();
    const { answers } = await completeDraft(focal, 'DEMO-001');
    expect(
      await focal.put(`${path}/draft`, { baseVersion: 0, answers }),
    ).toMatchObject({ status: 409, body: { code: 'version_conflict' } });
  });

  it('requires attestation but keeps the draft (AT26)', async () => {
    await published();
    const { draft } = await completeDraft(focal, 'DEMO-001');
    expect(
      await focal.post(
        `${path}/submit`,
        { draftVersion: draft.version },
        { 'Idempotency-Key': 'k1' },
      ),
    ).toMatchObject({ status: 422, body: { code: 'attestation_required' } });
    expect(
      await focal.post(`${path}/submit`, {
        draftVersion: draft.version,
        attestation,
      }),
    ).toMatchObject({
      status: 400,
      body: { code: 'idempotency_key_required' },
    });
    const bundle = await focal.json<ReportBundle>(`${path}/report`);
    expect(bundle.draft?.version).toBe(draft.version);
    const approval = {
      kind: 'not_available',
      explanation: 'Institutional approval minutes have not yet been supplied.',
    };
    const submitted = await focal.post(
      `${path}/submit`,
      {
        draftVersion: draft.version,
        attestation: { ...attestation, approval },
      },
      { 'Idempotency-Key': 'authorized-approval-unavailable' },
    );
    expect(submitted.status).toBe(201);
    expect(submitted.body).toMatchObject({ approval });
    const receipt = submitted.body as Receipt;
    const officer = await api.client().signIn('officer-a');
    expect(await officer.json(`/receipts/${receipt.id}`)).toMatchObject({
      approval,
    });
  });

  it('reports what is still missing', async () => {
    await published();
    const check = await focal.json<Completeness>(`${path}/completeness`);
    expect(check.complete).toBe(false);
    expect(check.missing.map((item) => item.field)).toContain(
      'questions.cpc-minutes',
    );
  });

  it('submits once per idempotency key and hides scores from the receipt (AT06, AT07)', async () => {
    await published();
    const { draft, upload } = await completeDraft(focal, 'DEMO-001');
    const submit = () =>
      focal.post(
        `${path}/submit`,
        { draftVersion: draft.version, attestation },
        { 'Idempotency-Key': 'same-key' },
      );
    const first = await submit();
    const retry = await submit();
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    const receipt = first.body as Receipt;
    expect((retry.body as Receipt).id).toBe(receipt.id);
    expect(receipt).toMatchObject({
      revision: 1,
      timeliness: 'on_time',
      daysLate: 0,
      calculation: 'recorded',
      evidenceComplete: false,
      institutionName: 'Demo Appointments Service Agency',
    });
    expect(receipt.declaredUnavailable.map((item) => item.label)).toEqual([
      'Signed IAO meeting minutes for the quarter',
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(/points|fraction|numerator/);

    const bundle = await focal.json<ReportBundle>(`${path}/report`);
    expect(bundle.receipts).toHaveLength(1);
    expect(bundle.obligation).toMatchObject({
      state: 'submitted',
      currentRevision: 1,
      firstSubmittedAt: '2026-10-01T08:00:00+03:00',
      firstCompleteEvidenceAt: null,
    });
    expect(bundle.draft).toBeNull();
    expect(bundle.editable).toBe(false);
    // The submitted answers come back, so a later clarification response can be compared.
    expect(bundle.submitted?.revision).toBe(1);
    expect(
      (await focal.json<Receipt[]>('/receipts')).map((item) => item.id),
    ).toEqual([receipt.id]);

    // The officer is notified and can now open the submitted file; the audit trail has it.
    const officerNotices = await api.db
      .select()
      .from(notifications)
      .where(eq(notifications.eventType, 'submission.received'));
    expect(officerNotices.map((notice) => notice.recipientId)).toEqual([
      'officer-a',
    ]);
    const officer = await api.client().signIn('officer-a');
    expect((await officer.request(`/evidence/${upload.id}/file`)).status).toBe(
      200,
    );
    expect((await officer.json<Receipt>(`/receipts/${receipt.id}`)).id).toBe(
      receipt.id,
    );
    const outsider = await api.client().signIn('officer-b');
    expect((await outsider.request(`/receipts/${receipt.id}`)).status).toBe(
      404,
    );
  });

  it('audits administrator file access (PRD §5.2)', async () => {
    await published();
    const { draft, upload } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    const admin = await api.client().signIn('administrator');
    expect((await admin.request(`/evidence/${upload.id}/file`)).status).toBe(
      200,
    );
    const [access] = await api.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'evidence.access'));
    expect(access).toMatchObject({ objectId: upload.id });
  });

  it('treats the last second as on time and the next as one day late (AT11)', async () => {
    await published();
    const submitAt = async (institutionId: string, at: string) => {
      const client = await api
        .client()
        .signIn(`focal-${institutionId.toLowerCase()}`);
      const { draft } = await completeDraft(client, institutionId);
      await setBusinessTime(at);
      return submitDraft(client, institutionId, draft.version);
    };
    const onTime = await submitAt('DEMO-002', '2026-10-15T23:59:59+03:00');
    const late = await submitAt('DEMO-003', '2026-10-16T00:00:00+03:00');
    expect(onTime).toMatchObject({ timeliness: 'on_time', daysLate: 0 });
    expect(late).toMatchObject({ timeliness: 'late', daysLate: 1 });
  });
});
