import { http, HttpResponse } from 'msw';
import {
  foundationKindSchema,
  foundationReviewRequestSchema,
  foundationUnsupportedRequestSchema,
  reviewAtCutoff,
  versionAtCutoff,
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
import type {
  MockFoundationReview,
  MockFoundationVersion,
} from '@cpi/contracts/fixtures';
import { effectiveCutoff } from '../services/clarifications';
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

const toReview = (review: MockFoundationReview) => ({
  versionId: review.versionId,
  checks: review.checks,
  reviewedBy: review.reviewedBy,
  reviewedAt: review.reviewedAt,
});

/** Checklist scoring (PRD §10.3): claimed checks with a supplied document, then officer-accepted checks. */
function foundationsFor(user: MockUser, institutionId: string): Foundations {
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
      const reviews = db.foundationReviews.filter(
        (candidate) =>
          candidate.institutionId === institutionId && candidate.kind === kind,
      );
      // The latest review of the active version gives current credit; a review of a superseded
      // or withdrawn version cannot (AT28). Earlier reviews stay as history.
      const review = active
        ? reviews.find((candidate) => candidate.versionId === active.id)
        : undefined;
      const atCutoff = versionAtCutoff(versions, db.cycle.evaluationCutoff);
      const cutoffReview = reviewAtCutoff(reviews, atCutoff);
      const maxPoints = maxPointsFor(kind);
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
        review: review ? toReview(review) : null,
        atCutoff,
        cutoffReview: cutoffReview ? toReview(cutoffReview) : null,
        provisional: internal
          ? calculated(
              maxPoints,
              active ? active.claimedChecks.filter(Boolean).length : 0,
            )
          : null,
        reviewed: internal
          ? review
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

const versionsOf = (institutionId: string, kind: FoundationKind) =>
  getDb().foundationVersions.filter(
    (version) =>
      version.institutionId === institutionId && version.kind === kind,
  );

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
      // The active version gives current credit; the version effective at the cutoff gives the
      // annual one, even after a future-effective successor is recorded (AT28).
      const atCutoff = versionAtCutoff(
        versionsOf(institutionId, kind.data),
        getDb().cycle.evaluationCutoff,
      );
      if (
        version.status !== 'active' &&
        !(atCutoff.status === 'applicable' && atCutoff.versionId === version.id)
      )
        return apiError(
          409,
          'Review the active version or the one effective at the evaluation cutoff; this one is neither.',
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
        // Newest first; earlier reviews stay as history.
        db.foundationReviews.unshift({
          id: nextId('foundation-review'),
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

  // No valid document at the cutoff: an explicit 0 of 4 with a reason, never inferred (AT28).
  http.post(
    '/api/institutions/:institutionId/foundations/:kind/unsupported',
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
      if (!kind.success) return notFound();
      const body = foundationUnsupportedRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!body.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const db = getDb();
      if (Date.parse(db.businessTime) <= effectiveCutoff(institutionId))
        return apiError(
          409,
          'An unsupported disposition can be recorded only after the evaluation cutoff and any extension.',
          'cutoff_not_passed',
        );
      const atCutoff = versionAtCutoff(
        versionsOf(institutionId, kind.data),
        db.cycle.evaluationCutoff,
      );
      if (atCutoff.status === 'applicable')
        return apiError(
          409,
          'A valid version covers the cutoff: review it instead.',
          'version_at_cutoff',
        );
      if (atCutoff.status === 'conflict')
        return apiError(
          409,
          'Versions with overlapping effective dates cover the cutoff: resolve the dates first.',
          'conflicting_versions',
        );
      const reason = body.data.reason;
      commit((db) => {
        db.foundationReviews.unshift({
          id: nextId('foundation-review'),
          institutionId,
          kind: kind.data,
          versionId: null,
          checks: [0, 1, 2, 3].map(() => ({
            outcome: 'fail' as const,
            passage: '',
            reason,
          })),
          reviewedBy: user.displayName,
          reviewedAt: db.businessTime,
        });
        audit(
          db,
          user,
          'foundation.unsupported',
          { type: 'foundation', id: `${institutionId}:${kind.data}` },
          `${labels[kind.data]}: no valid version at the cutoff; 0 of 4. ${reason}`,
        );
      });
      return HttpResponse.json(foundationsFor(user, institutionId));
    },
  ),
];
