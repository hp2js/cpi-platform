import { http, HttpResponse } from 'msw';
import {
  saveDraftRequestSchema,
  submitRequestSchema,
  type Receipt,
} from '@cpi/contracts';
import {
  commit,
  getDb,
  nextId,
  toEvidenceItem,
  type MockEvidence,
  type MockObligation,
} from '../db';
import {
  assignedOfficers,
  audit,
  institutionUsers,
  notify,
} from '../services/events';
import {
  checkUpload,
  evidenceCategories,
  MAX_SUBMISSION_BYTES,
  sha256,
} from '../services/evidence';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import {
  baselineOf,
  completeness,
  emptyAnswers,
  periodOf,
  referencedEvidenceIds,
  reportBundle,
} from '../services/reporting';
import { canReadInstitution } from '../services/scope';
import { requireRole, requireUser } from '../services/session';

/** Drafts are private to the institution (PRD §5.2), so only its own users reach them. */
function ownObligation(obligationId: unknown): MockObligation {
  const user = requireRole('institution');
  const obligation = getDb().obligations.find(
    (candidate) => candidate.id === obligationId,
  );
  if (!obligation || obligation.institutionId !== user.institutionId)
    throw notFound();
  return obligation;
}

function evidenceIdsFor(obligationId: string) {
  return getDb()
    .evidence.filter((item) => item.obligationId === obligationId)
    .map((item) => item.id);
}

// Structural check: the parsed part's File class differs between browsers and Node.
const isFile = (value: unknown): value is File =>
  typeof value === 'object' &&
  value !== null &&
  'arrayBuffer' in value &&
  'name' in value;

export const reportingHandlers = [
  http.get('/api/obligations/:obligationId/report', async ({ params }) => {
    await networkDelay();
    return HttpResponse.json(reportBundle(ownObligation(params.obligationId)));
  }),

  http.put(
    '/api/obligations/:obligationId/draft',
    async ({ params, request }) => {
      await networkDelay();
      const obligation = ownObligation(params.obligationId);
      const bundle = reportBundle(obligation);
      if (!bundle.editable || !bundle.form)
        return apiError(
          409,
          'This report cannot be edited now.',
          'not_editable',
        );
      const parsed = saveDraftRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'The draft could not be read. Reload the page and try again.',
          'invalid_draft',
        );
      const current = bundle.draft?.version ?? 0;
      if (parsed.data.baseVersion !== current) {
        return apiError(
          409,
          'This draft was changed in another tab or window. Reload to see the latest version before saving.',
          'version_conflict',
        );
      }
      const draft = {
        obligationId: obligation.id,
        formVersionId: bundle.draft?.formVersionId ?? bundle.form.id,
        answers: parsed.data.answers,
        version: current + 1,
        savedAt: getDb().businessTime,
      };
      commit((db) => {
        db.drafts = db.drafts.filter(
          (candidate) => candidate.obligationId !== obligation.id,
        );
        db.drafts.push(draft);
        if (obligation.state === 'not_started') obligation.state = 'draft';
      });
      return HttpResponse.json(draft);
    },
  ),

  http.get(
    '/api/obligations/:obligationId/completeness',
    async ({ params }) => {
      await networkDelay();
      const obligation = ownObligation(params.obligationId);
      const bundle = reportBundle(obligation);
      if (!bundle.form) return notFound();
      const answers =
        bundle.draft?.answers ??
        emptyAnswers(bundle.form, bundle.baseline.milestones);
      return HttpResponse.json(
        completeness(
          bundle.form,
          bundle.baseline.milestones,
          answers,
          evidenceIdsFor(obligation.id),
        ),
      );
    },
  ),

  http.post(
    '/api/obligations/:obligationId/evidence',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireUser();
      const obligation = ownObligation(params.obligationId);
      if (!reportBundle(obligation).editable)
        return apiError(
          409,
          'Evidence can only be added while the report is a draft.',
          'not_editable',
        );
      const data = await request.formData().catch(() => undefined);
      const file = data?.get('file');
      const category = data?.get('category');
      const replaces = data?.get('replaces');
      if (
        !isFile(file) ||
        typeof category !== 'string' ||
        !evidenceCategories.includes(category as never)
      ) {
        return apiError(422, 'Choose a file to upload.', 'invalid_upload', {
          file: 'Choose a file to upload.',
        });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkUpload(file.name, bytes);
      if (!check.ok)
        return apiError(422, check.message, 'upload_rejected', {
          file: check.message,
        });
      const hash = await sha256(bytes);
      const db = getDb();
      const current = db.evidence.filter(
        (item) =>
          item.obligationId === obligation.id && item.supersededBy === null,
      );
      // A retried upload of the same file returns the completed record instead of duplicating it.
      const duplicate = current.find(
        (item) => item.category === category && item.sha256 === hash,
      );
      if (duplicate) return HttpResponse.json(toEvidenceItem(duplicate));
      const previous =
        typeof replaces === 'string' && replaces
          ? current.find((item) => item.id === replaces)
          : undefined;
      if (
        typeof replaces === 'string' &&
        replaces &&
        (!previous || previous.category !== category)
      ) {
        return apiError(
          422,
          'The file being replaced was not found in this report.',
          'invalid_upload',
          { file: 'The file being replaced was not found.' },
        );
      }
      const used = current.reduce((sum, item) => sum + item.sizeBytes, 0);
      if (used + bytes.byteLength > MAX_SUBMISSION_BYTES) {
        return apiError(
          422,
          'A report can include up to 100 MB of evidence.',
          'upload_rejected',
          { file: 'A report can include up to 100 MB of evidence.' },
        );
      }
      const item: MockEvidence = {
        id: nextId('ev'),
        category: category as MockEvidence['category'],
        fileName: file.name,
        mimeType: check.mimeType,
        sizeBytes: bytes.byteLength,
        sha256: hash,
        uploadedAt: db.businessTime,
        uploadedBy: user.displayName,
        version: previous ? previous.version + 1 : 1,
        predecessorId: previous?.id ?? null,
        supersededBy: null,
        institutionId: obligation.institutionId,
        obligationId: obligation.id,
      };
      commit((store) => {
        store.evidence.push(item);
        if (previous) previous.supersededBy = item.id;
        audit(
          store,
          user,
          previous ? 'evidence.replace' : 'evidence.upload',
          { type: 'evidence', id: item.id, version: item.version },
          `${item.fileName} (${item.category}) for ${obligation.id}`,
        );
      });
      return HttpResponse.json(toEvidenceItem(item), { status: 201 });
    },
  ),

  http.post(
    '/api/obligations/:obligationId/submit',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireUser();
      const obligation = ownObligation(params.obligationId);
      const key = request.headers.get('Idempotency-Key');
      if (!key)
        return apiError(
          400,
          'Submission requires an Idempotency-Key header.',
          'idempotency_key_required',
        );
      const db = getDb();
      const existing = db.idempotency[key];
      if (existing)
        return HttpResponse.json(
          db.receipts.find((receipt) => receipt.id === existing),
        );

      const bundle = reportBundle(obligation);
      if (!bundle.editable || !bundle.form || !bundle.draft)
        return apiError(
          409,
          'There is no saved draft to submit.',
          'not_editable',
        );
      const parsed = submitRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fieldErrors[issue.path.join('.')] ??=
            'Complete this before submitting.';
        return apiError(
          422,
          'Confirm your authority to submit before submitting. Your draft is saved.',
          'attestation_required',
          fieldErrors,
        );
      }
      if (parsed.data.draftVersion !== bundle.draft.version) {
        return apiError(
          409,
          'The draft changed since you reviewed it. Review the latest version before submitting.',
          'version_conflict',
        );
      }
      const available = evidenceIdsFor(obligation.id);
      const check = completeness(
        bundle.form,
        bundle.baseline.milestones,
        bundle.draft.answers,
        available,
      );
      if (!check.complete) {
        const fieldErrors: Record<string, string> = {};
        for (const item of check.missing)
          fieldErrors[item.field] ??= item.message;
        return apiError(
          422,
          'Some required items are unanswered. Your draft is saved.',
          'incomplete',
          fieldErrors,
        );
      }

      const period = periodOf(obligation.periodId);
      const revision = (obligation.currentRevision ?? 0) + 1;
      const evidenceIds = referencedEvidenceIds(
        bundle.draft.answers,
        available,
      );
      const institution = db.institutions.find(
        (candidate) => candidate.id === obligation.institutionId,
      )!;
      const openClarifications = db.clarifications.filter(
        (clarification) =>
          clarification.obligationId === obligation.id &&
          clarification.status === 'open',
      );
      const receipt: Receipt = {
        id: nextId('rcpt'),
        obligationId: obligation.id,
        institutionId: obligation.institutionId,
        institutionName: institution.name,
        periodId: period.id,
        periodLabel: period.label,
        revision,
        receivedAt: db.businessTime,
        recordedAt: new Date().toISOString(),
        deadline: period.submissionDeadline,
        timeliness:
          Date.parse(db.businessTime) > Date.parse(period.submissionDeadline)
            ? 'late'
            : 'on_time',
        submittedBy: user.displayName,
        submitterRole: parsed.data.attestation.submitterRole,
        approval: parsed.data.attestation.approval,
        evidence: bundle.evidence.filter((item) =>
          evidenceIds.includes(item.id),
        ),
        declaredUnavailable: check.declarations,
        calculation:
          baselineOf(obligation.institutionId, obligation.periodId)?.status ===
          'approved'
            ? 'recorded'
            : 'pending_baseline_approval',
      };
      // Receipt, revision, state, events and idempotency record are committed together (FR07).
      commit((store) => {
        const submissionId = nextId('sub');
        store.submissions.push({
          id: submissionId,
          obligationId: obligation.id,
          revision,
          formVersionId: bundle.draft!.formVersionId,
          answers: bundle.draft!.answers,
          evidenceIds,
          attestation: parsed.data.attestation,
          receiptId: receipt.id,
          finalizedAt: null,
          finalizedBy: null,
        });
        store.receipts.push(receipt);
        store.idempotency[key] = receipt.id;
        store.drafts = store.drafts.filter(
          (candidate) => candidate.obligationId !== obligation.id,
        );
        for (const clarification of openClarifications) {
          clarification.status = 'responded';
          clarification.response = {
            revision,
            submittedAt: receipt.receivedAt,
          };
        }
        obligation.state = 'submitted';
        obligation.currentRevision = revision;
        obligation.firstSubmittedAt ??= receipt.receivedAt;
        obligation.lastReceiptAt = receipt.receivedAt;
        audit(
          store,
          user,
          'submission.submit',
          { type: 'submission', id: submissionId, version: revision },
          `${period.label} revision ${revision} (${receipt.timeliness === 'late' ? 'late' : 'on time'})`,
        );
        notify(
          store,
          receipt.id,
          'submission.receipt',
          institutionUsers(obligation.institutionId),
          {
            title: `${period.label} report received (revision ${revision})`,
            body: `Your ${period.label} report was received ${receipt.timeliness === 'late' ? 'after' : 'before'} the deadline. Receipt ${receipt.id}.`,
            link: `/institution/receipts/${receipt.id}`,
          },
        );
        notify(
          store,
          `${receipt.id}:review`,
          revision > 1 ? 'submission.revised' : 'submission.received',
          assignedOfficers(obligation.institutionId),
          {
            title:
              revision > 1
                ? `Revised submission: ${obligation.institutionId} ${period.label}`
                : `New submission: ${obligation.institutionId} ${period.label}`,
            body:
              revision > 1
                ? `Revision ${revision} responds to your clarification request.`
                : 'A report is waiting for your review.',
            link: `/officer/reviews/${submissionId}`,
          },
        );
      });
      return HttpResponse.json(receipt, { status: 201 });
    },
  ),

  http.get('/api/receipts', async () => {
    await networkDelay();
    const user = requireRole('institution');
    return HttpResponse.json(
      getDb()
        .receipts.filter(
          (receipt) => receipt.institutionId === user.institutionId,
        )
        .reverse(),
    );
  }),

  http.get('/api/receipts/:receiptId', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    const receipt = getDb().receipts.find(
      (candidate) => candidate.id === params.receiptId,
    );
    if (!receipt || !canReadInstitution(user, receipt.institutionId))
      return notFound();
    return HttpResponse.json(receipt);
  }),
];
