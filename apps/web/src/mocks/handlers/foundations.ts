import { http, HttpResponse } from 'msw';
import {
  foundationKindSchema,
  foundationReviewRequestSchema,
  type ComponentScore,
  type FoundationKind,
  type Foundations,
} from '@cpi/contracts';
import { z } from 'zod';
import {
  commit,
  getDb,
  nextId,
  toEvidenceItem,
  type MockEvidence,
} from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';
import type { MockFoundationVersion } from '@cpi/contracts/fixtures';
import { assignedOfficers, audit, notify } from '../services/events';
import { checkUpload, sha256 } from '../services/evidence';
import { storeFile } from '../services/files';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { assignedInstitutionIds, canReadInstitution } from '../services/scope';
import { points } from '@cpi/contracts';
import { requireRole, requireUser } from '../services/session';
import { activeProfile, activeWeights } from '../services/profiles';

const labels: Record<FoundationKind, string> = {
  procedures: 'Procedures',
  risk_assessment: 'Risk assessment',
  mitigation_plan: 'Mitigation plan',
};
const weightKey = {
  procedures: 'procedures',
  risk_assessment: 'riskAssessment',
  mitigation_plan: 'mitigationPlan',
} as const;

function maxPointsFor(kind: FoundationKind) {
  return activeWeights()[weightKey[kind]];
}

const calculated = (maxPoints: number, numerator: number): ComponentScore => ({
  status: 'calculated',
  fraction: { numerator, denominator: 4 },
  maxPoints,
  points: points(maxPoints, { numerator, denominator: 4 }),
});

/** Checklist scoring (PRD §10.3): claimed checks with a supplied document, then officer-accepted checks. */
export function foundationsFor(
  user: MockUser,
  institutionId: string,
): Foundations {
  const db = getDb();
  const internal = user.role !== 'institution';
  return {
    institutionId,
    deadline: db.cycle.foundationDeadline,
    indicators: foundationKindSchema.options.map((kind) => {
      const versions = db.foundationVersions
        .filter(
          (version) =>
            version.institutionId === institutionId && version.kind === kind,
        )
        .sort((a, b) => b.version - a.version);
      const active = versions.find((version) => version.status === 'active');
      const review =
        db.foundationReviews.find(
          (candidate) =>
            candidate.institutionId === institutionId &&
            candidate.kind === kind,
        ) ?? null;
      const maxPoints = maxPointsFor(kind);
      // A review of a superseded or withdrawn version cannot supply current credit (AT28).
      const reviewCurrent = review && active && review.versionId === active.id;
      return {
        kind,
        label: labels[kind],
        maxPoints,
        checks: activeProfile(db).checklists[weightKey[kind]],
        mode:
          kind === 'procedures'
            ? activeProfile(db).proceduresMode
            : ('scored' as const),
        versions: versions.map((version) => ({
          id: version.id,
          kind: version.kind,
          version: version.version,
          evidence: toEvidenceItem(
            db.evidence.find((item) => item.id === version.evidenceId)!,
          ),
          approvalReference: version.approvalReference,
          effectiveFrom: version.effectiveFrom,
          effectiveTo: version.effectiveTo,
          status: version.status,
          recordedAt: version.recordedAt,
          claimedChecks: version.claimedChecks,
          withdrawnReason: version.withdrawnReason,
        })),
        review: review && {
          versionId: review.versionId,
          checks: review.checks,
          reviewedBy: review.reviewedBy,
          reviewedAt: review.reviewedAt,
        },
        provisional: internal
          ? calculated(
              maxPoints,
              active ? active.claimedChecks.filter(Boolean).length : 0,
            )
          : null,
        reviewed: internal
          ? reviewCurrent
            ? calculated(
                maxPoints,
                review.checks.filter((check) => check.outcome === 'pass')
                  .length,
              )
            : {
                status: 'pending',
                maxPoints,
                reason: 'foundation_not_reviewed',
              }
          : null,
      };
    }),
  };
}

function readable(user: MockUser, institutionId: unknown) {
  if (
    typeof institutionId !== 'string' ||
    !canReadInstitution(user, institutionId)
  )
    throw notFound();
  return institutionId;
}

const isFile = (value: unknown): value is File =>
  typeof value === 'object' &&
  value !== null &&
  'arrayBuffer' in value &&
  'name' in value;
const uploadFieldsSchema = z.object({
  kind: foundationKindSchema,
  approvalReference: z.string().min(2).max(300),
  effectiveFrom: z.iso.date(),
  claimedChecks: z.array(z.boolean()).length(4),
});

export const foundationHandlers = [
  http.get(
    '/api/institutions/:institutionId/foundations',
    async ({ params }) => {
      await networkDelay();
      const user = requireUser();
      return HttpResponse.json(
        foundationsFor(user, readable(user, params.institutionId)),
      );
    },
  ),

  http.post(
    '/api/institutions/:institutionId/foundations',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('institution');
      const institutionId = readable(user, params.institutionId);
      const data = await request.formData().catch(() => undefined);
      const file = data?.get('file');
      const fields = uploadFieldsSchema.safeParse({
        kind: data?.get('kind'),
        approvalReference: data?.get('approvalReference'),
        effectiveFrom: data?.get('effectiveFrom'),
        claimedChecks: JSON.parse(
          String(data?.get('claimedChecks') ?? '[]'),
        ) as unknown,
      });
      if (!isFile(file))
        return apiError(422, 'Choose a file to upload.', 'invalid_upload', {
          file: 'Choose a file to upload.',
        });
      if (!fields.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of fields.error.issues)
          fieldErrors[issue.path.join('.')] ??= 'Complete this field.';
        return apiError(
          422,
          'Complete the highlighted fields.',
          'invalid_foundation',
          fieldErrors,
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = await checkUpload(file.name, bytes);
      if (!check.ok)
        return apiError(422, check.message, 'upload_rejected', {
          file: check.message,
        });
      const hash = await sha256(bytes);
      await storeFile(hash, bytes);
      const db = getDb();
      const previous = db.foundationVersions
        .filter(
          (version) =>
            version.institutionId === institutionId &&
            version.kind === fields.data.kind,
        )
        .sort((a, b) => b.version - a.version)[0];
      const evidence: MockEvidence = {
        id: nextId('ev'),
        institutionId,
        obligationId: `${institutionId}:foundations`,
        category: fields.data.kind,
        fileName: file.name,
        mimeType: check.mimeType,
        sizeBytes: bytes.byteLength,
        sha256: hash,
        uploadedAt: db.businessTime,
        uploadedBy: user.displayName,
        version: 1,
        predecessorId: null,
        supersededBy: null,
      };
      const version: MockFoundationVersion = {
        id: nextId('fv'),
        institutionId,
        kind: fields.data.kind,
        version: (previous?.version ?? 0) + 1,
        evidenceId: evidence.id,
        approvalReference: fields.data.approvalReference.trim(),
        effectiveFrom: fields.data.effectiveFrom,
        effectiveTo: null,
        status: 'active',
        recordedAt: db.businessTime,
        claimedChecks: fields.data.claimedChecks,
        withdrawnReason: null,
      };
      commit((store) => {
        store.evidence.push(evidence);
        // Supersession keeps the earlier version and its decisions; it never deletes history.
        for (const existing of store.foundationVersions) {
          if (
            existing.institutionId === institutionId &&
            existing.kind === version.kind &&
            existing.status === 'active'
          ) {
            existing.status = 'superseded';
            existing.effectiveTo = version.effectiveFrom;
          }
        }
        store.foundationVersions.push(version);
        audit(
          store,
          user,
          'foundation.upload',
          { type: 'foundation', id: version.id, version: version.version },
          `${labels[version.kind]} v${version.version}, effective ${version.effectiveFrom}`,
        );
        notify(
          store,
          version.id,
          'foundation.uploaded',
          assignedOfficers(institutionId),
          {
            title: `New ${labels[version.kind].toLowerCase()} version: ${institutionId}`,
            body: `Version ${version.version} was recorded and needs review.`,
            link: `/officer/institutions/${institutionId}`,
          },
        );
      });
      return HttpResponse.json(foundationsFor(user, institutionId), {
        status: 201,
      });
    },
  ),

  http.post(
    '/api/foundation-versions/:versionId/withdraw',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('institution');
      const version = getDb().foundationVersions.find(
        (candidate) => candidate.id === params.versionId,
      );
      if (!version || version.institutionId !== user.institutionId)
        return notFound();
      const body = z
        .object({ reason: z.string().min(10).max(1000) })
        .safeParse(await request.json().catch(() => undefined));
      if (!body.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      if (version.status !== 'active')
        return apiError(
          409,
          'Only the active version can be withdrawn.',
          'not_active',
        );
      commit((db) => {
        version.status = 'withdrawn';
        version.withdrawnReason = body.data.reason.trim();
        audit(
          db,
          user,
          'foundation.withdraw',
          { type: 'foundation', id: version.id, version: version.version },
          body.data.reason.trim(),
        );
      });
      return HttpResponse.json(foundationsFor(user, version.institutionId));
    },
  ),

  http.put(
    '/api/institutions/:institutionId/foundations/:kind/review',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const institutionId = readable(user, params.institutionId);
      if (
        user.role !== 'officer' ||
        !assignedInstitutionIds(user.id).includes(institutionId)
      )
        return apiError(
          403,
          'Only the assigned officer can review foundations.',
          'forbidden',
        );
      const kind = foundationKindSchema.safeParse(params.kind);
      const body = foundationReviewRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!kind.success || !body.success)
        return apiError(
          422,
          'Record an outcome for all four checks.',
          'invalid_review',
        );
      const version = getDb().foundationVersions.find(
        (candidate) =>
          candidate.id === body.data.versionId &&
          candidate.institutionId === institutionId &&
          candidate.kind === kind.data,
      );
      if (!version) return notFound();
      if (version.status !== 'active')
        return apiError(
          409,
          'Review the active version; this one is superseded or withdrawn.',
          'not_active',
        );
      const fieldErrors: Record<string, string> = {};
      body.data.checks.forEach((check, index) => {
        if (check.outcome === 'pass' && !check.passage.trim())
          fieldErrors[`checks.${index}.passage`] =
            'Cite the page or section that supports this check.';
        if (check.outcome === 'fail' && check.reason.trim().length < 10)
          fieldErrors[`checks.${index}.reason`] =
            'Explain why the check is not met (at least 10 characters).';
      });
      if (Object.keys(fieldErrors).length)
        return apiError(
          422,
          'Each accepted check cites a passage; each failed check needs a reason.',
          'invalid_review',
          fieldErrors,
        );
      commit((db) => {
        db.foundationReviews = db.foundationReviews.filter(
          (review) =>
            !(
              review.institutionId === institutionId &&
              review.kind === kind.data
            ),
        );
        db.foundationReviews.push({
          institutionId,
          kind: kind.data,
          versionId: version.id,
          checks: body.data.checks,
          reviewedBy: user.displayName,
          reviewedAt: db.businessTime,
        });
        audit(
          db,
          user,
          'foundation.review',
          { type: 'foundation', id: version.id, version: version.version },
          `${labels[kind.data]}: ${body.data.checks.filter((check) => check.outcome === 'pass').length} of 4 checks met`,
        );
      });
      return HttpResponse.json(foundationsFor(user, institutionId));
    },
  ),
];
