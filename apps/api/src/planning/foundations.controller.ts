import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  foundationKindSchema,
  foundationReviewRequestSchema,
  type Foundations,
} from '@cpi/contracts';
import { assignedInstitutionIds, canReadInstitution } from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write } from '../database/db';
import {
  evidence,
  evidenceFiles,
  foundationReviews,
  foundationVersions,
} from '../database/schema';
import { Events, assignedOfficers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { MAX_FILE_BYTES, checkUpload } from '../reporting/rules';
import { foundationLabels, foundationsFor } from './foundations';

const uploadFieldsSchema = z.object({
  kind: foundationKindSchema,
  approvalReference: z.string().min(2).max(300),
  effectiveFrom: z.iso.date(),
  claimedChecks: z.array(z.boolean()).length(4),
});

function parseJson(value: unknown) {
  try {
    return JSON.parse(typeof value === 'string' ? value : '[]') as unknown;
  } catch {
    return undefined;
  }
}

type Upload = { originalname: string; buffer: Buffer } | undefined;

/** Procedures, risk assessment and mitigation plan documents (PRD §10.3, AT28). */
@Controller()
export class FoundationsController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  @Get('institutions/:institutionId/foundations')
  async get(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
  ): Promise<Foundations> {
    if (!(await canReadInstitution(this.db, user, institutionId)))
      throw notFound();
    return foundationsFor(this.db, institutionId, user.role !== 'institution');
  }

  @Post('institutions/:institutionId/foundations')
  @Roles('institution')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES + 1, files: 1 },
      defParamCharset: 'utf8',
    }),
  )
  upload(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @UploadedFile() file: Upload,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<Foundations> {
    return write(this.db, async (tx, businessTime) => {
      if (user.institutionId !== institutionId) throw notFound();
      if (!file)
        throw new ApiError(422, 'Choose a file to upload.', 'invalid_upload', {
          file: 'Choose a file to upload.',
        });
      const fields = uploadFieldsSchema.safeParse({
        kind: body?.kind,
        approvalReference: body?.approvalReference,
        effectiveFrom: body?.effectiveFrom,
        claimedChecks: parseJson(body?.claimedChecks),
      });
      if (!fields.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of fields.error.issues)
          fieldErrors[issue.path.join('.')] ??= 'Complete this field.';
        throw new ApiError(
          422,
          'Complete the highlighted fields.',
          'invalid_foundation',
          fieldErrors,
        );
      }
      const check = checkUpload(file.originalname, file.buffer);
      if (!check.ok)
        throw new ApiError(422, check.message, 'upload_rejected', {
          file: check.message,
        });
      const { kind } = fields.data;
      const [previous] = await tx
        .select()
        .from(foundationVersions)
        .where(
          and(
            eq(foundationVersions.institutionId, institutionId),
            eq(foundationVersions.kind, kind),
          ),
        )
        .orderBy(desc(foundationVersions.version))
        .limit(1);
      const evidenceId = await nextId(tx, 'ev');
      await tx.insert(evidence).values({
        id: evidenceId,
        institutionId,
        obligationId: null,
        category: kind,
        fileName: file.originalname,
        mimeType: check.mimeType,
        sizeBytes: file.buffer.byteLength,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        uploadedAt: businessTime,
        uploadedBy: user.displayName,
        version: 1,
        predecessorId: null,
        supersededBy: null,
      });
      await tx.insert(evidenceFiles).values({ evidenceId, bytes: file.buffer });
      // Supersession keeps the earlier version and its decisions; it never deletes history.
      await tx
        .update(foundationVersions)
        .set({ status: 'superseded', effectiveTo: fields.data.effectiveFrom })
        .where(
          and(
            eq(foundationVersions.institutionId, institutionId),
            eq(foundationVersions.kind, kind),
            eq(foundationVersions.status, 'active'),
          ),
        );
      const [version] = await tx
        .insert(foundationVersions)
        .values({
          id: await nextId(tx, 'fv'),
          institutionId,
          kind,
          version: (previous?.version ?? 0) + 1,
          evidenceId,
          approvalReference: fields.data.approvalReference.trim(),
          effectiveFrom: fields.data.effectiveFrom,
          effectiveTo: null,
          status: 'active',
          recordedAt: businessTime,
          claimedChecks: fields.data.claimedChecks,
          withdrawnReason: null,
        })
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'foundation.upload',
        { type: 'foundation', id: version!.id, version: version!.version },
        `${foundationLabels[kind]} v${version!.version}, effective ${version!.effectiveFrom}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        version!.id,
        'foundation.uploaded',
        await assignedOfficers(tx, institutionId),
        {
          title: `New ${foundationLabels[kind].toLowerCase()} version: ${institutionId}`,
          body: `Version ${version!.version} was recorded and needs review.`,
          link: `/officer/institutions/${institutionId}`,
        },
      );
      return foundationsFor(tx, institutionId, false);
    });
  }

  @Post('foundation-versions/:versionId/withdraw')
  @HttpCode(200)
  @Roles('institution')
  withdraw(
    @CurrentUser() user: User,
    @Param('versionId') id: string,
    @Body() body: unknown,
  ): Promise<Foundations> {
    return write(this.db, async (tx, businessTime) => {
      const [version] = await tx
        .select()
        .from(foundationVersions)
        .where(eq(foundationVersions.id, id));
      if (!version || version.institutionId !== user.institutionId)
        throw notFound();
      const parsed = z
        .object({ reason: z.string().min(10).max(1000) })
        .safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      if (version.status !== 'active')
        throw new ApiError(
          409,
          'Only the active version can be withdrawn.',
          'not_active',
        );
      const reason = parsed.data.reason.trim();
      await tx
        .update(foundationVersions)
        .set({ status: 'withdrawn', withdrawnReason: reason })
        .where(eq(foundationVersions.id, id));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'foundation.withdraw',
        { type: 'foundation', id, version: version.version },
        reason,
      );
      return foundationsFor(tx, version.institutionId, false);
    });
  }

  @Put('institutions/:institutionId/foundations/:kind/review')
  @Roles('officer', 'supervisor', 'administrator')
  review(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('kind') kindParam: string,
    @Body() body: unknown,
  ): Promise<Foundations> {
    return write(this.db, async (tx, businessTime) => {
      if (!(await canReadInstitution(tx, user, institutionId)))
        throw notFound();
      if (
        user.role !== 'officer' ||
        !(await assignedInstitutionIds(tx, user.id)).includes(institutionId)
      )
        throw new ApiError(
          403,
          'Only the assigned officer can review foundations.',
          'forbidden',
        );
      const kind = foundationKindSchema.safeParse(kindParam);
      const parsed = foundationReviewRequestSchema.safeParse(body);
      if (!kind.success || !parsed.success)
        throw new ApiError(
          422,
          'Record an outcome for all four checks.',
          'invalid_review',
        );
      const [version] = await tx
        .select()
        .from(foundationVersions)
        .where(
          and(
            eq(foundationVersions.id, parsed.data.versionId),
            eq(foundationVersions.institutionId, institutionId),
            eq(foundationVersions.kind, kind.data),
          ),
        );
      if (!version) throw notFound();
      if (version.status !== 'active')
        throw new ApiError(
          409,
          'Review the active version; this one is superseded or withdrawn.',
          'not_active',
        );
      const fieldErrors: Record<string, string> = {};
      parsed.data.checks.forEach((check, index) => {
        if (check.outcome === 'pass' && !check.passage.trim())
          fieldErrors[`checks.${index}.passage`] =
            'Cite the page or section that supports this check.';
        if (check.outcome === 'fail' && check.reason.trim().length < 10)
          fieldErrors[`checks.${index}.reason`] =
            'Explain why the check is not met (at least 10 characters).';
      });
      if (Object.keys(fieldErrors).length)
        throw new ApiError(
          422,
          'Each accepted check cites a passage; each failed check needs a reason.',
          'invalid_review',
          fieldErrors,
        );
      await tx.insert(foundationReviews).values({
        institutionId,
        kind: kind.data,
        versionId: version.id,
        checks: parsed.data.checks,
        reviewedBy: user.displayName,
        reviewedAt: businessTime,
      });
      await this.events.audit(
        tx,
        businessTime,
        user,
        'foundation.review',
        { type: 'foundation', id: version.id, version: version.version },
        `${foundationLabels[kind.data]}: ${parsed.data.checks.filter((check) => check.outcome === 'pass').length} of 4 checks met`,
      );
      return foundationsFor(tx, institutionId, true);
    });
  }
}
