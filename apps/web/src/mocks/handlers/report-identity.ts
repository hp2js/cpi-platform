import { http, HttpResponse } from 'msw';
import {
  builtinReportImage,
  defaultReportIdentity,
  inspectReportImage,
  reportImageIn,
  reportImageSlotLabel,
  reportIdentityIssues,
  reportIdentityUpdateSchema,
  reportImageSlotSchema,
  summarizeIdentityChange,
  type ReportIdentity,
  type ReportIdentitySettings,
} from '@cpi/contracts';
import type { MockUser } from '@cpi/contracts/fixtures';
import { commit, getDb, nextId, type MockDb } from '../db';
import { audit } from '../services/events';
import { sha256 } from '../services/evidence';
import { loadFile, storeFile } from '../services/files';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireRole, requireUser } from '../services/session';

/** The identity in force: the cycle's own, or the safe fictional default (HP2-65). */
export const reportIdentityOf = (db: MockDb): ReportIdentity =>
  db.reportIdentity ?? defaultReportIdentity;

function settings(): ReportIdentitySettings {
  const db = getDb();
  return {
    identity: reportIdentityOf(db),
    changes: [...db.reportIdentityChanges].reverse(),
  };
}

function record(db: MockDb, user: MockUser, summary: string) {
  db.reportIdentityChanges.push({
    at: db.businessTime,
    by: user.displayName,
    summary,
  });
  audit(
    db,
    user,
    'report_identity.update',
    { type: 'cycle', id: db.cycle.id },
    summary,
  );
}

export const reportIdentityHandlers = [
  http.get('/api/report-identity', async () => {
    await networkDelay();
    requireUser();
    return HttpResponse.json(reportIdentityOf(getDb()));
  }),
  http.get('/api/report-identity/images/:imageId', async ({ params }) => {
    await networkDelay();
    requireUser();
    const builtin = builtinReportImage(String(params.imageId));
    if (builtin)
      return new HttpResponse(builtin.bytes.slice().buffer, {
        headers: { 'Content-Type': builtin.mimeType },
      });
    const image = getDb().reportImages.find(
      (candidate) => candidate.id === params.imageId,
    );
    const bytes = image ? await loadFile(image.sha256) : undefined;
    if (!image || !bytes) return notFound();
    return new HttpResponse(bytes, {
      headers: { 'Content-Type': image.mimeType },
    });
  }),
  http.get('/api/settings/report-identity', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json(settings());
  }),
  http.put('/api/settings/report-identity', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = reportIdentityUpdateSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Some values need attention.',
        'invalid_settings',
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
    const issues = reportIdentityIssues(parsed.data);
    if (issues.length)
      return apiError(
        422,
        'Check the highlighted fields.',
        'invalid_identity',
        Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
      );
    commit((db) => {
      const before = reportIdentityOf(db);
      db.reportIdentity = { ...before, ...parsed.data };
      record(db, user, summarizeIdentityChange(before, parsed.data));
    });
    return HttpResponse.json(settings());
  }),
  http.post(
    '/api/settings/report-identity/images/:slot',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('administrator');
      const slot = reportImageSlotSchema.safeParse(params.slot);
      if (!slot.success) return notFound();
      const data = await request.formData().catch(() => undefined);
      const file = data?.get('file');
      if (!(file instanceof File))
        return apiError(422, 'Choose an image to upload.', 'file_required', {
          file: 'Choose an image to upload.',
        });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const inspected = inspectReportImage(bytes);
      if (!inspected.ok)
        return apiError(422, inspected.message, 'invalid_image', {
          file: inspected.message,
        });
      const hash = await sha256(bytes);
      await storeFile(hash, bytes);
      commit((db) => {
        const image = {
          id: nextId('img'),
          mimeType: inspected.mimeType,
          sizeBytes: bytes.length,
          width: inspected.width,
          height: inspected.height,
          sha256: hash,
        };
        db.reportImages.push({
          ...image,
          uploadedAt: db.businessTime,
          uploadedBy: user.displayName,
        });
        db.reportIdentity = { ...reportIdentityOf(db), [slot.data]: image };
        record(
          db,
          user,
          `New ${reportImageSlotLabel(slot.data)} (${inspected.width} × ${inspected.height})`,
        );
      });
      return HttpResponse.json(settings());
    },
  ),
  http.delete(
    '/api/settings/report-identity/images/:slot',
    async ({ params }) => {
      await networkDelay();
      const user = requireRole('administrator');
      const slot = reportImageSlotSchema.safeParse(params.slot);
      if (!slot.success) return notFound();
      commit((db) => {
        const before = reportIdentityOf(db);
        if (!reportImageIn(before, slot.data)) return;
        db.reportIdentity = { ...before, [slot.data]: null };
        record(db, user, `Removed ${reportImageSlotLabel(slot.data)}`);
      });
      return HttpResponse.json(settings());
    },
  ),
];
