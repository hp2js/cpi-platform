import { http, HttpResponse } from 'msw';
import { commit, getDb, type MockDb, type MockEvidence } from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';
import { audit } from '../services/events';
import { demonstrationPdf, loadFile } from '../services/files';
import { notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { canReadInstitution } from '../services/scope';
import { requireUser } from '../services/session';

/** How long an administrator's audited support view opens the draft's files (actual time). */
const SUPPORT_WINDOW_MS = 30 * 60_000;

/**
 * Who may open a stored file (PRD §5.2, §13.1):
 * - the institution's own users: every file of theirs, drafts included;
 * - officers, supervisors and administrators in scope: submitted evidence and foundation
 *   documents, which are theirs to review;
 * - an administrator: a draft's files for 30 minutes after an audited support view of it.
 * Anything else is indistinguishable from a missing file.
 */
export function evidenceAccess(
  db: MockDb,
  user: MockUser,
  item: MockEvidence,
): 'owner' | 'reviewer' | 'support' | null {
  if (!canReadInstitution(user, item.institutionId)) return null;
  if (user.role === 'institution') return 'owner';
  const submitted = db.submissions.some((submission) =>
    submission.evidenceIds.includes(item.id),
  );
  const foundation = db.foundationVersions.some(
    (version) => version.evidenceId === item.id,
  );
  if (submitted || foundation) return 'reviewer';
  if (
    user.role === 'administrator' &&
    db.audit.some(
      (event) =>
        event.action === 'support.draft_view' &&
        event.objectId === item.obligationId &&
        event.actorName === user.displayName &&
        event.actorRole === 'administrator' &&
        Date.now() - Date.parse(event.actualTime) < SUPPORT_WINDOW_MS,
    )
  )
    return 'support';
  return null;
}

const disposition = (kind: 'inline' | 'attachment', name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

export const fileHandlers = [
  http.get('/api/evidence/:evidenceId/file', async ({ params, request }) => {
    await networkDelay();
    const user = requireUser();
    const db = getDb();
    const item = db.evidence.find(
      (candidate) => candidate.id === params.evidenceId,
    );
    const access = item ? evidenceAccess(db, user, item) : null;
    if (!item || !access) throw notFound();
    // Administrator access to institution files is logged (PRD §5.2).
    if (user.role === 'administrator')
      commit((store) =>
        audit(
          store,
          user,
          'evidence.access',
          { type: 'evidence', id: item.id, version: item.version },
          `${item.fileName} opened by an administrator${access === 'support' ? ' during a support view' : ''}`,
        ),
      );
    const kind = new URL(request.url).searchParams.has('download')
      ? 'attachment'
      : 'inline';
    const bytes = await loadFile(item.sha256);
    if (bytes)
      return new HttpResponse(bytes, {
        headers: {
          'Content-Type': item.mimeType,
          'Content-Length': String(bytes.byteLength),
          'Content-Disposition': disposition(kind, item.fileName),
        },
      });
    // Seeded files never had contents (and a browser may not have kept an upload's): serve a
    // labelled demonstration copy instead.
    const name = item.fileName.replace(/\.[^.]+$/, '');
    return new HttpResponse(
      demonstrationPdf(item.fileName, [
        'DEMONSTRATION COPY',
        '',
        'The mock API has no stored contents for this file: it was seeded for the simulation,',
        'or this browser did not keep the upload. A file uploaded here normally opens as uploaded.',
        '',
        `Category: ${item.category}`,
        `Version: ${item.version}`,
        `Uploaded by: ${item.uploadedBy}`,
        `Uploaded: ${item.uploadedAt}`,
        `Recorded size: ${item.sizeBytes} bytes`,
        `SHA-256: ${item.sha256}`,
      ]),
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': disposition(kind, `${name}-demonstration.pdf`),
          'X-Demonstration-Copy': 'true',
        },
      },
    );
  }),
];
