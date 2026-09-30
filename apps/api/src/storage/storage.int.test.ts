import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  evidence,
  evidenceFiles,
  foundationVersions,
} from '../database/schema';
import { write } from '../database/db';
import { integration, startApi } from '../test/api';
import { pdf, publishSeedForm } from '../test/journeys';
import { Files } from './files';
import { Objects } from './objects';
import type { Infrastructure } from '../infrastructure';

describe.skipIf(!integration)('private S3 file storage', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());
  const path = '/obligations/DEMO-001%3AFY2026-27-Q1/evidence';
  async function upload() {
    await publishSeedForm(await api.client().signIn('administrator'));
    const focal = await api.client().signIn('focal-demo-001');
    const result = await focal.upload(
      path,
      { name: 'Minutes.pdf', bytes: pdf('object storage') },
      { category: 'cpc_minutes' },
    );
    expect(result.status).toBe(201);
    const id = (result.body as { id: string }).id;
    const [stored] = await api.db
      .select()
      .from(evidenceFiles)
      .where(eq(evidenceFiles.evidenceId, id));
    return { focal, id, stored: stored! };
  }
  it('stores bytes only in a private object, retaining authorization and integrity', async () => {
    const { focal, id, stored } = await upload();
    expect(stored.bytes).toBeNull();
    expect(stored.objectKey).toMatch(/^evidence\/tests\//);
    const anonymous = await fetch(
      `${api.objects.config.S3_ENDPOINT}/${stored.bucket}/${stored.objectKey}`,
    );
    expect(anonymous.status).toBe(403);
    const downloaded = await focal.request(`/evidence/${id}/file`);
    expect(downloaded.status).toBe(200);
    expect(downloaded.body).toBe(Buffer.from(pdf('object storage')).toString());
    expect(downloaded.headers.get('cache-control')).toBe('private, no-store');
    const other = await api.client().signIn('focal-demo-002');
    expect((await other.request(`/evidence/${id}/file`)).status).toBe(404);
    await api.objects.remove({
      bucket: stored.bucket!,
      objectKey: stored.objectKey!,
    });
    const missing = await focal.request(`/evidence/${id}/file`);
    expect(missing.status).toBe(503);
    expect(missing.body).toMatchObject({ code: 'file_unavailable' });
    expect(missing.headers.get('x-demonstration-copy')).toBeNull();
    expect((await other.request(`/evidence/${id}/file`)).status).toBe(404);
  });
  it('foundation retries retain one version and use the same object store', async () => {
    const focal = await api.client().signIn('focal-demo-001');
    const send = () =>
      focal.upload(
        '/institutions/DEMO-001/foundations',
        { name: 'Approved.pdf', bytes: pdf('approved') },
        {
          kind: 'procedures',
          approvalReference: 'REF-123',
          effectiveFrom: '2026-07-01',
          claimedChecks: '[true,true,true,true]',
        },
      );
    expect((await send()).status).toBe(201);
    const first = await api.db
      .select()
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.institutionId, 'DEMO-001'),
          eq(foundationVersions.kind, 'procedures'),
        ),
      );
    expect((await send()).status).toBe(201);
    const after = await api.db
      .select()
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.institutionId, 'DEMO-001'),
          eq(foundationVersions.kind, 'procedures'),
        ),
      );
    expect(after.length).toBe(first.length);
    const current = after.find((item) => item.status === 'active')!;
    const [stored] = await api.db
      .select()
      .from(evidenceFiles)
      .where(eq(evidenceFiles.evidenceId, current.evidenceId));
    expect(stored?.objectKey).toBeTruthy();
    expect(stored?.bytes).toBeNull();
  });
  it('compensates an object write when its database transaction rolls back', async () => {
    const files = new Files(
      { database: api.db } as Infrastructure,
      api.objects,
    );
    const before = [];
    for await (const object of api.objects.list())
      before.push(object.objectKey);
    await expect(
      files.withUpload((persist) =>
        write(api.db, async (tx) => {
          const id = 'rollback-test';
          await tx.insert(evidence).values({
            id,
            institutionId: 'DEMO-001',
            obligationId: null,
            category: 'procedures',
            fileName: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4,
            sha256: 'unused',
            uploadedAt: new Date().toISOString(),
            uploadedBy: 'Test',
            version: 1,
          });
          await persist(tx, id, Buffer.from('%PDF'), 'application/pdf');
          throw new Error('Forced rollback');
        }),
      ),
    ).rejects.toThrow('Forced rollback');
    const after = [];
    for await (const object of api.objects.list()) after.push(object.objectKey);
    expect(after.sort()).toEqual(before.sort());
    expect(
      await api.db
        .select()
        .from(evidence)
        .where(eq(evidence.id, 'rollback-test')),
    ).toEqual([]);
  });
  it('leaves metadata and legacy data intact on storage failures', async () => {
    const { id, stored } = await upload();
    const unavailable = new Objects({
      ...api.objects.config,
      S3_ENDPOINT: 'http://127.0.0.1:1',
    });
    const files = new Files(
      { database: api.db } as Infrastructure,
      unavailable,
    );
    try {
      await expect(
        files.withUpload((persist) =>
          write(api.db, (tx) =>
            persist(tx, id, Buffer.from('%PDF'), 'application/pdf'),
          ),
        ),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        (
          await api.db
            .select()
            .from(evidenceFiles)
            .where(eq(evidenceFiles.evidenceId, id))
        )[0],
      ).toEqual(stored);
    } finally {
      unavailable.onApplicationShutdown();
    }
  });
  it('reads legacy bytes and only drops them after verified migration', async () => {
    const bytes = Buffer.from(pdf('legacy'));
    await api.db.insert(evidence).values({
      id: 'legacy-file',
      institutionId: 'DEMO-001',
      category: 'other',
      fileName: 'legacy.pdf',
      mimeType: 'application/pdf',
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Test',
      version: 1,
    });
    await api.db
      .insert(evidenceFiles)
      .values({ evidenceId: 'legacy-file', bytes });
    const focal = await api.client().signIn('focal-demo-001');
    expect((await focal.request('/evidence/legacy-file/file')).body).toBe(
      bytes.toString(),
    );
    const files = new Files(
      { database: api.db } as Infrastructure,
      api.objects,
    );
    await files.withUpload((persist) =>
      write(api.db, (tx) =>
        persist(tx, 'legacy-file', bytes, 'application/pdf', true),
      ),
    );
    expect(
      (
        await api.db
          .select()
          .from(evidenceFiles)
          .where(eq(evidenceFiles.evidenceId, 'legacy-file'))
      )[0]?.bytes,
    ).toBeNull();
    expect((await focal.request('/evidence/legacy-file/file')).body).toBe(
      bytes.toString(),
    );
  });
});
