import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Response } from 'express';
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
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write } from '../database/db';
import {
  auditEvents,
  clarifications,
  drafts,
  evidence,
  foundationVersions,
  idempotencyKeys,
  institutions,
  obligations,
  receipts,
  submissions,
} from '../database/schema';
import { toNairobi } from '../database/schema';
import { currentState } from '../database/state';
import { Events, assignedOfficers, institutionUsers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { Files } from '../storage/files';
import { loadReport, ownObligation, toEvidenceItem } from './report';
import {
  MAX_FILE_BYTES,
  MAX_SUBMISSION_BYTES,
  checkUpload,
  completeness,
  emptyAnswers,
  evidenceCategories,
  referencedEvidenceIds,
} from './rules';

type Upload = { originalname: string; buffer: Buffer } | undefined;

/** An administrator's audited support view opens a draft's files for this long. */
const SUPPORT_WINDOW_MS = 30 * 60_000;

/** Quarterly reporting by the institution (PRD §7.2, FR05–FR07). */
@Controller()
export class ReportingController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
    private readonly files: Files,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  @Get('obligations/:obligationId/report')
  @Roles('institution')
  async report(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
  ): Promise<ReportBundle> {
    const obligation = await ownObligation(this.db, user, id);
    return (await loadReport(this.db, obligation)).bundle;
  }

  @Put('obligations/:obligationId/draft')
  @Roles('institution')
  saveDraft(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @Body() body: unknown,
  ): Promise<Draft> {
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
      await tx
        .insert(drafts)
        .values(draft)
        .onConflictDoUpdate({ target: drafts.obligationId, set: draft });
      if (obligation.state === 'not_started')
        await tx
          .update(obligations)
          .set({ state: 'draft' })
          .where(eq(obligations.id, obligation.id));
      return draft;
    });
  }

  @Get('obligations/:obligationId/completeness')
  @Roles('institution')
  async completeness(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
  ): Promise<Completeness> {
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

  @Post('obligations/:obligationId/evidence')
  @Roles('institution')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_FILE_BYTES,
        files: 1,
        fields: 8,
        fieldSize: 4096,
        parts: 9,
      },
      defParamCharset: 'utf8',
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @UploadedFile() file: Upload,
    @Body() body: { category?: unknown; replaces?: unknown } | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EvidenceItem> {
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
        const category = body?.category;
        const replaces =
          typeof body?.replaces === 'string' && body.replaces
            ? body.replaces
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
            {
              file: 'Choose a file to upload.',
            },
          );
        const check = checkUpload(file.originalname, file.buffer);
        if (!check.ok)
          throw new ApiError(422, check.message, 'upload_rejected', {
            file: check.message,
          });
        const hash = createHash('sha256').update(file.buffer).digest('hex');
        const current = report.evidence.filter(
          (item) => item.supersededBy === null,
        );
        // A retried upload of the same file returns the completed record instead of duplicating it.
        const duplicate = current.find(
          (item) => item.category === category && item.sha256 === hash,
        );
        if (duplicate) {
          response.status(200);
          return toEvidenceItem(duplicate);
        }
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
        const [item] = await tx
          .insert(evidence)
          .values({
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
          })
          .returning();
        await persist(tx, item!.id, file.buffer, check.mimeType);
        if (previous)
          await tx
            .update(evidence)
            .set({ supersededBy: item!.id })
            .where(eq(evidence.id, previous.id));
        await this.events.audit(
          tx,
          businessTime,
          user,
          previous ? 'evidence.replace' : 'evidence.upload',
          { type: 'evidence', id: item!.id, version: item!.version },
          `${item!.fileName} (${item!.category}) for ${obligation.id}`,
        );
        return toEvidenceItem(item!);
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
  @Get('evidence/:evidenceId/file')
  async file(
    @CurrentUser() user: User,
    @Param('evidenceId') id: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ) {
    const [item] = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id));
    if (!item || !(await canReadInstitution(this.db, user, item.institutionId)))
      throw notFound();
    let viaSupport = false;
    if (user.role !== 'institution') {
      const [[submitted], [foundation]] = await Promise.all([
        this.db
          .select({ id: submissions.id })
          .from(submissions)
          .where(
            sql`${submissions.evidenceIds} @> ${JSON.stringify([id])}::jsonb`,
          )
          .limit(1),
        this.db
          .select({ id: foundationVersions.id })
          .from(foundationVersions)
          .where(eq(foundationVersions.evidenceId, id))
          .limit(1),
      ]);
      if (!submitted && !foundation) {
        const [support] =
          user.role === 'administrator' && item.obligationId
            ? await this.db
                .select({ id: auditEvents.id })
                .from(auditEvents)
                .where(
                  and(
                    eq(auditEvents.action, 'support.draft_view'),
                    eq(auditEvents.objectId, item.obligationId),
                    eq(auditEvents.actorName, user.displayName),
                    eq(auditEvents.actorRole, 'administrator'),
                    gt(
                      auditEvents.actualTime,
                      new Date(Date.now() - SUPPORT_WINDOW_MS).toISOString(),
                    ),
                  ),
                )
                .limit(1)
            : [];
        if (!support) throw notFound();
        viaSupport = true;
      }
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
    const kind = download === undefined ? 'inline' : 'attachment';
    const disposition = (name: string) =>
      `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    response.setHeader('Cache-Control', 'private, no-store');
    const stored = await this.files.read(item);
    if (stored) {
      response
        .type(item.mimeType)
        .setHeader('Content-Length', String(stored.byteLength))
        .setHeader('Content-Disposition', disposition(item.fileName))
        .send(stored);
      return;
    }
    // Seeded fixture documents have metadata only: serve a labelled demonstration copy.
    const name = item.fileName.replace(/\.[^.]+$/, '');
    response
      .type('application/pdf')
      .setHeader(
        'Content-Disposition',
        disposition(`${name}-demonstration.pdf`),
      )
      .setHeader('X-Demonstration-Copy', 'true')
      .send(
        Buffer.from(
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
      );
  }

  @Post('obligations/:obligationId/submit')
  @Roles('institution')
  submit(
    @CurrentUser() user: User,
    @Param('obligationId') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Receipt> {
    if (!key || key.length > 200)
      throw new ApiError(
        400,
        'Submission requires an Idempotency-Key header.',
        'idempotency_key_required',
      );
    return write(this.db, async (tx, businessTime) => {
      const obligation = await ownObligation(tx, user, id);
      // A retry after a lost response returns the original receipt, with no second revision (AT06).
      const [replay] = await tx
        .select({ receipt: receipts.receipt })
        .from(idempotencyKeys)
        .innerJoin(receipts, eq(receipts.id, idempotencyKeys.receiptId))
        .where(
          and(
            eq(idempotencyKeys.userId, user.id),
            eq(idempotencyKeys.key, key),
          ),
        );
      if (replay) {
        response.status(200);
        return replay.receipt;
      }
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
      const [institution] = await tx
        .select({ name: institutions.name })
        .from(institutions)
        .where(eq(institutions.id, obligation.institutionId));
      // Complete evidence: every required document supplied, none declared unavailable.
      const evidenceComplete = !check.declarations.some((declaration) =>
        /unavailable$/i.test(declaration.field),
      );
      const { cycle } = await currentState(tx);
      const receipt: Receipt = {
        id: await nextId(tx, 'rcpt'),
        obligationId: obligation.id,
        institutionId: obligation.institutionId,
        institutionName: institution!.name,
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
      // Receipt, revision, state, events and idempotency record are committed together (FR07).
      const submissionId = await nextId(tx, 'sub');
      await tx.insert(receipts).values({
        id: receipt.id,
        obligationId: obligation.id,
        institutionId: obligation.institutionId,
        receipt,
      });
      await tx.insert(submissions).values({
        id: submissionId,
        obligationId: obligation.id,
        revision,
        formVersionId: draft.formVersionId,
        answers: draft.answers,
        evidenceIds,
        attestation: parsed.data.attestation,
        receiptId: receipt.id,
      });
      await tx
        .insert(idempotencyKeys)
        .values({ userId: user.id, key, receiptId: receipt.id });
      await tx.delete(drafts).where(eq(drafts.obligationId, obligation.id));
      await tx
        .update(clarifications)
        .set({
          status: 'responded',
          response: { revision, submittedAt: receipt.receivedAt },
        })
        .where(
          and(
            eq(clarifications.obligationId, obligation.id),
            eq(clarifications.status, 'open'),
          ),
        );
      await tx
        .update(obligations)
        .set({
          state: 'submitted',
          currentRevision: revision,
          firstSubmittedAt: obligation.firstSubmittedAt ?? receipt.receivedAt,
          firstCompleteEvidenceAt:
            obligation.firstCompleteEvidenceAt ??
            (evidenceComplete ? receipt.receivedAt : null),
          lastReceiptAt: receipt.receivedAt,
        })
        .where(eq(obligations.id, obligation.id));
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
      response.status(201);
      return receipt;
    });
  }

  @Get('receipts')
  @Roles('institution')
  async receipts(@CurrentUser() user: User): Promise<Receipt[]> {
    const rows = await this.db
      .select({ receipt: receipts.receipt })
      .from(receipts)
      .where(eq(receipts.institutionId, user.institutionId ?? ''))
      .orderBy(desc(receipts.seq));
    return rows.map((row) => row.receipt);
  }

  @Get('receipts/:receiptId')
  async receipt(
    @CurrentUser() user: User,
    @Param('receiptId') id: string,
  ): Promise<Receipt> {
    const [row] = await this.db
      .select()
      .from(receipts)
      .where(eq(receipts.id, id));
    if (!row || !(await canReadInstitution(this.db, user, row.institutionId)))
      throw notFound();
    return row.receipt;
  }
}
