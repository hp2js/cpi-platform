import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  foundationKindSchema,
  foundationReviewRequestSchema,
  type Foundations,
} from '@cpi/contracts';
import { assignedInstitutionIds, canReadInstitution } from '../auth/scope';
import type { User } from '../auth/sessions';
import { DB, nextId, write, type Database } from '../database/db';
import { Events, assignedOfficers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Files } from '../storage/files';
import { checkUpload } from '../reporting/rules';
import { foundationLabels, foundationsFor } from './foundations';
import { FoundationsRepository } from './foundations.repository';
import { ReportingRepository } from '../reporting/reporting.repository';

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

export type Upload = { originalname: string; buffer: Buffer } | undefined;
export type UploadFields = Record<string, unknown> | undefined;

/**
 * Procedures, risk assessment and mitigation plan documents (PRD §10.3, AT28). Bodies are
 * validated after scope and ownership checks.
 */
@Injectable()
export class FoundationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: FoundationsRepository,
    private readonly reporting: ReportingRepository,
    private readonly events: Events,
    private readonly files: Files,
  ) {}

  async get(user: User, institutionId: string): Promise<Foundations> {
    if (!(await canReadInstitution(this.db, user, institutionId)))
      throw notFound();
    return foundationsFor(this.db, institutionId, user.role !== 'institution');
  }

  upload(
    user: User,
    institutionId: string,
    file: Upload,
    body: UploadFields,
  ): Promise<Foundations> {
    this.files.assertUploadsApproved();
    return this.files.withUpload((persist) =>
      write(this.db, async (tx, businessTime) => {
        if (user.institutionId !== institutionId) throw notFound();
        if (!file)
          throw new ApiError(
            422,
            'Choose a file to upload.',
            'invalid_upload',
            {
              file: 'Choose a file to upload.',
            },
          );
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
        const check = await checkUpload(file.originalname, file.buffer);
        if (!check.ok)
          throw new ApiError(422, check.message, 'upload_rejected', {
            file: check.message,
          });
        const { kind } = fields.data;
        const previous = await this.repository.latestVersion(
          institutionId,
          kind,
          tx,
        );
        const hash = createHash('sha256').update(file.buffer).digest('hex');
        if (
          previous?.status === 'active' &&
          previous.approvalReference === fields.data.approvalReference.trim() &&
          previous.effectiveFrom === fields.data.effectiveFrom &&
          JSON.stringify(previous.claimedChecks) ===
            JSON.stringify(fields.data.claimedChecks)
        ) {
          if (
            (await this.repository.evidenceSha256(previous.evidenceId, tx)) ===
            hash
          )
            return foundationsFor(tx, institutionId, false);
        }
        const evidenceId = await nextId(tx, 'ev');
        await this.reporting.insertEvidence(
          {
            id: evidenceId,
            institutionId,
            obligationId: null,
            category: kind,
            fileName: file.originalname,
            mimeType: check.mimeType,
            sizeBytes: file.buffer.byteLength,
            sha256: hash,
            uploadedAt: businessTime,
            uploadedBy: user.displayName,
            version: 1,
            predecessorId: null,
            supersededBy: null,
          },
          tx,
        );
        await persist(tx, evidenceId, file.buffer, check.mimeType);
        await this.repository.supersedeActive(
          institutionId,
          kind,
          fields.data.effectiveFrom,
          tx,
        );
        const version = await this.repository.insertVersion(
          {
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
          },
          tx,
        );
        await this.events.audit(
          tx,
          businessTime,
          user,
          'foundation.upload',
          { type: 'foundation', id: version.id, version: version.version },
          `${foundationLabels[kind]} v${version.version}, effective ${version.effectiveFrom}`,
        );
        await this.events.notify(
          tx,
          businessTime,
          version.id,
          'foundation.uploaded',
          await assignedOfficers(tx, institutionId),
          {
            title: `New ${foundationLabels[kind].toLowerCase()} version: ${institutionId}`,
            body: `Version ${version.version} was recorded and needs review.`,
            link: `/officer/institutions/${institutionId}`,
          },
        );
        return foundationsFor(tx, institutionId, false);
      }),
    );
  }

  withdraw(user: User, id: string, body: unknown): Promise<Foundations> {
    return write(this.db, async (tx, businessTime) => {
      const version = await this.repository.version(id, tx);
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
      await this.repository.withdraw(id, reason, tx);
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

  review(
    user: User,
    institutionId: string,
    kindParam: string,
    body: unknown,
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
      const version = await this.repository.versionOf(
        parsed.data.versionId,
        institutionId,
        kind.data,
        tx,
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
      await this.repository.insertReview(
        {
          institutionId,
          kind: kind.data,
          versionId: version.id,
          checks: parsed.data.checks,
          reviewedBy: user.displayName,
          reviewedAt: businessTime,
        },
        tx,
      );
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
