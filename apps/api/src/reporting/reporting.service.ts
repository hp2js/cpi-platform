import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  daysLate,
  demonstrationPdf,
  saveDraftRequestSchema,
  submitRequestSchema,
  type Completeness,
  type Draft,
  type EvidenceItem,
  type Receipt,
  type ReportBundle,
} from '@cpi/contracts';
import { canReadInstitution } from '../auth/scope';
import type { User } from '../auth/sessions';
import { DB, nextId, write, type Database } from '../database/db';
import { toNairobi } from '../database/schema';
import { currentState } from '../database/state';
import { Events, assignedOfficers, institutionUsers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Files } from '../storage/files';
import { AssistantService } from '../assistant/assistant.service';
import { loadReport, ownObligation, toEvidenceItem } from './report';
import { ReportingRepository } from './reporting.repository';
import {
  MAX_SUBMISSION_BYTES,
  checkUpload,
  completeness,
  emptyAnswers,
  evidenceCategories,
  referencedEvidenceIds,
} from './rules';

export type Upload = { originalname: string; buffer: Buffer } | undefined;
export type UploadFields =
  { category?: unknown; replaces?: unknown } | undefined;

/** A result whose status depends on whether it was created or replayed. */
export type Created<T> = { created: boolean; body: T };

/** A stored file, or a labelled demonstration copy for seeded metadata-only records. */
export type FileContent = {
  mimeType: string;
  fileName: string;
  bytes: Buffer;
  demonstration: boolean;
};

/** An administrator's audited support view opens a draft's files for this long. */
const SUPPORT_WINDOW_MS = 30 * 60_000;

/** Quarterly reporting by the institution (PRD §7.2, FR05–FR07). */
@Injectable()
export class ReportingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: ReportingRepository,
    private readonly events: Events,
    private readonly files: Files,
    private readonly assistant: AssistantService,
  ) {}

  async report(user: User, id: string): Promise<ReportBundle> {
    const obligation = await ownObligation(this.db, user, id);
    return (await loadReport(this.db, obligation)).bundle;
  }

  /** The body is checked after scope and editability, so those errors take precedence. */
  saveDraft(user: User, id: string, body: unknown): Promise<Draft> {
    return write(this.db, async (tx, businessTime) => {
      const obligation = await ownObligation(tx, user, id);
      const { bundle } = await loadReport(tx, obligation);
      if (!bundle.editable || !bundle.form)
        throw new ApiError(
          409,
          'This report cannot be edited now.',
          'not_editable',
        );
      const parsed = saveDraftRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'The draft could not be read. Reload the page and try again.',
          'invalid_draft',
        );
      const current = bundle.draft?.version ?? 0;
      if (parsed.data.baseVersion !== current)
        throw new ApiError(
          409,
          'This draft was changed in another tab or window. Reload to see the latest version before saving.',
          'version_conflict',
        );
      const draft: Draft = {
        obligationId: obligation.id,
        formVersionId: bundle.draft?.formVersionId ?? bundle.form.id,
        answers: parsed.data.answers,
        version: current + 1,
        savedAt: businessTime,
        savedBy: user.displayName,
      };
      await this.repository.saveDraft(draft, tx);
      if (obligation.state === 'not_started')
        await this.repository.updateObligation(
          obligation.id,
          { state: 'draft' },
          tx,
        );
      return draft;
    });
  }

  async completeness(user: User, id: string): Promise<Completeness> {
    const obligation = await ownObligation(this.db, user, id);
    const { bundle, form, milestones } = await loadReport(this.db, obligation);
    if (!form) throw notFound();
    return completeness(
      form,
      milestones,
      bundle.draft?.answers ?? emptyAnswers(form, milestones),
      bundle.evidence.map((item) => item.id),
    );
  }

  /** A retried upload of the same file returns the completed record (`created: false`). */
  upload(
    user: User,
    id: string,
    file: Upload,
    fields: UploadFields,
  ): Promise<Created<EvidenceItem>> {
    this.files.assertUploadsApproved();
    return this.files.withUpload((persist) =>
      write(this.db, async (tx, businessTime) => {
        const obligation = await ownObligation(tx, user, id);
        const report = await loadReport(tx, obligation);
        if (!report.bundle.editable)
          throw new ApiError(
            409,
            'Evidence can only be added while the report is a draft.',
            'not_editable',
          );
        const category = fields?.category;
        const replaces =
          typeof fields?.replaces === 'string' && fields.replaces
            ? fields.replaces
            : undefined;
        if (
          !file ||
          typeof category !== 'string' ||
          !evidenceCategories.includes(category as never)
        )
          throw new ApiError(
            422,
            'Choose a file to upload.',
            'invalid_upload',
            { file: 'Choose a file to upload.' },
          );
        const check = await checkUpload(file.originalname, file.buffer);
        if (!check.ok)
          throw new ApiError(422, check.message, 'upload_rejected', {
            file: check.message,
          });
        const hash = createHash('sha256').update(file.buffer).digest('hex');
        const current = report.evidence.filter(
          (item) => item.supersededBy === null,
        );
        const duplicate = current.find(
          (item) => item.category === category && item.sha256 === hash,
        );
        if (duplicate)
          return { created: false, body: toEvidenceItem(duplicate) };
        const previous = replaces
          ? current.find((item) => item.id === replaces)
          : undefined;
        if (replaces && (!previous || previous.category !== category))
          throw new ApiError(
            422,
            'The file being replaced was not found in this report.',
            'invalid_upload',
            { file: 'The file being replaced was not found.' },
          );
        const used = current.reduce((sum, item) => sum + item.sizeBytes, 0);
        if (
          used - (previous?.sizeBytes ?? 0) + file.buffer.byteLength >
          MAX_SUBMISSION_BYTES
        )
          throw new ApiError(
            422,
            'A report can include up to 100 MB of evidence.',
            'upload_rejected',
            { file: 'A report can include up to 100 MB of evidence.' },
          );
        const item = await this.repository.insertEvidence(
          {
            id: await nextId(tx, 'ev'),
            institutionId: obligation.institutionId,
            obligationId: obligation.id,
            category,
            fileName: file.originalname,
            mimeType: check.mimeType,
            sizeBytes: file.buffer.byteLength,
            sha256: hash,
            uploadedAt: businessTime,
            uploadedBy: user.displayName,
            version: previous ? previous.version + 1 : 1,
            predecessorId: previous?.id ?? null,
            supersededBy: null,
          },
          tx,
        );
        await persist(tx, item.id, file.buffer, check.mimeType);
        if (previous)
          await this.repository.supersedeEvidence(previous.id, item.id, tx);
        await this.events.audit(
          tx,
          businessTime,
          user,
          previous ? 'evidence.replace' : 'evidence.upload',
          { type: 'evidence', id: item.id, version: item.version },
          `${item.fileName} (${item.category}) for ${obligation.id}`,
        );
        return { created: true, body: toEvidenceItem(item) };
      }),
    );
  }

  /**
   * Who may open a stored file (PRD §5.2, §13.1):
   * - the institution's own users: every file of theirs, drafts included;
   * - officers, supervisors and administrators in scope: submitted evidence and foundation
   *   documents, which are theirs to review;
   * - an administrator: a draft's files for 30 minutes after an audited support view of it.
   * Anything else is indistinguishable from a missing file.
   */
  async file(user: User, id: string): Promise<FileContent> {
    const item = await this.repository.evidence(id);
    if (!item || !(await canReadInstitution(this.db, user, item.institutionId)))
      throw notFound();
    let viaSupport = false;
    if (
      user.role !== 'institution' &&
      !(await this.repository.isSubmittedOrFoundation(id))
    ) {
      const support =
        user.role === 'administrator' &&
        item.obligationId !== null &&
        (await this.repository.hasSupportView(
          item.obligationId,
          user.displayName,
          new Date(Date.now() - SUPPORT_WINDOW_MS).toISOString(),
        ));
      if (!support) throw notFound();
      viaSupport = true;
    }
    // Administrator access to institution files is logged (PRD §5.2).
    if (user.role === 'administrator')
      await write(this.db, (tx, businessTime) =>
        this.events.audit(
          tx,
          businessTime,
          user,
          'evidence.access',
          { type: 'evidence', id: item.id, version: item.version },
          `${item.fileName} opened by an administrator${viaSupport ? ' during a support view' : ''}`,
        ),
      );
    const stored = await this.files.read(item);
    if (stored)
      return {
        mimeType: item.mimeType,
        fileName: item.fileName,
        bytes: stored,
        demonstration: false,
      };
    // Seeded fixture documents have metadata only: serve a labelled demonstration copy.
    return {
      mimeType: 'application/pdf',
      fileName: `${item.fileName.replace(/\.[^.]+$/, '')}-demonstration.pdf`,
      demonstration: true,
      bytes: Buffer.from(
        demonstrationPdf(item.fileName, [
          'DEMONSTRATION COPY',
          '',
          'This fictional document was seeded for the simulation and has no stored contents.',
          'A file uploaded in the portal opens as uploaded.',
          '',
          `Category: ${item.category}`,
          `Version: ${item.version}`,
          `Uploaded by: ${item.uploadedBy}`,
          `Uploaded: ${item.uploadedAt}`,
          `Recorded size: ${item.sizeBytes} bytes`,
          `SHA-256: ${item.sha256}`,
        ]),
      ),
    };
  }

  /**
   * A retry after a lost response returns the original receipt (`created: false`), with no
   * second revision (AT06). The body is checked after scope, replay and editability.
   */
  async submit(
    user: User,
    id: string,
    key: string,
    body: unknown,
  ): Promise<Created<Receipt>> {
    let submitted: string | undefined;
    const result = await write(this.db, async (tx, businessTime) => {
      const obligation = await ownObligation(tx, user, id);
      const replay = await this.repository.receiptForKey(user.id, key, tx);
      if (replay) return { created: false, body: replay };
      const report = await loadReport(tx, obligation);
      const { bundle, form, milestones, period } = report;
      const draft = bundle.draft;
      if (!bundle.editable || !form || !draft)
        throw new ApiError(
          409,
          'There is no saved draft to submit.',
          'not_editable',
        );
      const parsed = submitRequestSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fieldErrors[issue.path.join('.')] ??=
            'Complete this before submitting.';
        throw new ApiError(
          422,
          'Confirm your authority to submit before submitting. Your draft is saved.',
          'attestation_required',
          fieldErrors,
        );
      }
      if (parsed.data.draftVersion !== draft.version)
        throw new ApiError(
          409,
          'The draft changed since you reviewed it. Review the latest version before submitting.',
          'version_conflict',
        );
      const available = bundle.evidence.map((item) => item.id);
      const check = completeness(form, milestones, draft.answers, available);
      if (!check.complete) {
        const fieldErrors: Record<string, string> = {};
        for (const item of check.missing)
          fieldErrors[item.field] ??= item.message;
        throw new ApiError(
          422,
          'Some required items are unanswered. Your draft is saved.',
          'incomplete',
          fieldErrors,
        );
      }

      const revision = (obligation.currentRevision ?? 0) + 1;
      const evidenceIds = referencedEvidenceIds(draft.answers, available);
      const institutionName = await this.repository.institutionName(
        obligation.institutionId,
        tx,
      );
      // Complete evidence: every required document supplied, none declared unavailable.
      const evidenceComplete = !check.declarations.some((declaration) =>
        /unavailable$/i.test(declaration.field),
      );
      const { cycle } = await currentState(tx);
      const receipt: Receipt = {
        id: await nextId(tx, 'rcpt'),
        obligationId: obligation.id,
        institutionId: obligation.institutionId,
        institutionName: institutionName!,
        periodId: period.id,
        periodLabel: period.label,
        revision,
        receivedAt: businessTime,
        recordedAt: toNairobi(new Date()),
        deadline: period.submissionDeadline,
        timeliness:
          Date.parse(businessTime) > Date.parse(period.submissionDeadline)
            ? 'late'
            : 'on_time',
        daysLate: daysLate(
          businessTime,
          period.submissionDeadline,
          cycle.dayCounting,
        ),
        daysLateUnit: cycle.dayCounting.mode,
        evidenceComplete,
        submittedBy: user.displayName,
        submitterRole: parsed.data.attestation.submitterRole,
        approval: parsed.data.attestation.approval,
        evidence: bundle.evidence.filter((item) =>
          evidenceIds.includes(item.id),
        ),
        declaredUnavailable: check.declarations,
        calculation:
          report.baseline?.status === 'approved'
            ? 'recorded'
            : 'pending_baseline_approval',
      };
      const submissionId = await nextId(tx, 'sub');
      await this.repository.recordSubmission(
        {
          receipt,
          submission: {
            id: submissionId,
            obligationId: obligation.id,
            revision,
            formVersionId: draft.formVersionId,
            answers: draft.answers,
            evidenceIds,
            attestation: parsed.data.attestation,
            receiptId: receipt.id,
          },
          userId: user.id,
          key,
          obligation: {
            state: 'submitted',
            currentRevision: revision,
            firstSubmittedAt: obligation.firstSubmittedAt ?? receipt.receivedAt,
            firstCompleteEvidenceAt:
              obligation.firstCompleteEvidenceAt ??
              (evidenceComplete ? receipt.receivedAt : null),
            lastReceiptAt: receipt.receivedAt,
          },
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'submission.submit',
        { type: 'submission', id: submissionId, version: revision },
        `${period.label} revision ${revision} (${receipt.timeliness === 'late' ? 'late' : 'on time'})`,
      );
      await this.events.notify(
        tx,
        businessTime,
        receipt.id,
        'submission.receipt',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `${period.label} report received (revision ${revision})`,
          body: `Your ${period.label} report was received ${receipt.timeliness === 'late' ? 'after' : 'before'} the deadline. Receipt ${receipt.id}.`,
          link: `/institution/receipts/${receipt.id}`,
        },
      );
      await this.events.notify(
        tx,
        businessTime,
        `${receipt.id}:review`,
        revision > 1 ? 'submission.revised' : 'submission.received',
        await assignedOfficers(tx, obligation.institutionId),
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
      submitted = submissionId;
      return { created: true, body: receipt };
    });
    // The evidence assistant reads the files in the background; the receipt never waits for it.
    if (submitted) void this.assistant.reviewSubmission(user, submitted);
    return result;
  }

  receipts(user: User): Promise<Receipt[]> {
    return this.repository.receipts(user.institutionId ?? '');
  }

  async receipt(user: User, id: string): Promise<Receipt> {
    const row = await this.repository.receipt(id);
    if (!row || !(await canReadInstitution(this.db, user, row.institutionId)))
      throw notFound();
    return row.receipt;
  }
}
