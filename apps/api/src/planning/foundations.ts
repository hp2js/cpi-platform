import { desc, eq, inArray } from 'drizzle-orm';
import {
  foundationKindSchema,
  points,
  reviewAtCutoff,
  versionAtCutoff,
  type ComponentScore,
  type FoundationKind,
  type Foundations,
} from '@cpi/contracts';
import type { Db } from '../database/db';
import {
  evidence,
  foundationReviews,
  foundationVersions,
} from '../database/schema';
import { currentState } from '../database/state';
import { toEvidenceItem } from '../reporting/report';

export const foundationLabels: Record<FoundationKind, string> = {
  procedures: 'Procedures',
  risk_assessment: 'Risk assessment',
  mitigation_plan: 'Mitigation plan',
};
const weightKey = {
  procedures: 'procedures',
  risk_assessment: 'riskAssessment',
  mitigation_plan: 'mitigationPlan',
} as const;

const calculated = (maxPoints: number, numerator: number): ComponentScore => ({
  status: 'calculated',
  fraction: { numerator, denominator: 4 },
  maxPoints,
  points: points(maxPoints, { numerator, denominator: 4 }),
});

const toReview = (review: typeof foundationReviews.$inferSelect) => ({
  versionId: review.versionId,
  checks: review.checks,
  reviewedBy: review.reviewedBy,
  reviewedAt: review.reviewedAt,
});

/**
 * Checklist scoring (PRD §10.3): claimed checks with a supplied document, then officer-accepted
 * checks. Scores are internal: institution users get null before publication (O06).
 */
export async function foundationsFor(
  db: Db,
  institutionId: string,
  internal: boolean,
): Promise<Foundations> {
  const [{ cycle, profile }, versionRows, reviewRows] = await Promise.all([
    currentState(db),
    db
      .select()
      .from(foundationVersions)
      .where(eq(foundationVersions.institutionId, institutionId))
      .orderBy(desc(foundationVersions.version)),
    db
      .select()
      .from(foundationReviews)
      .where(eq(foundationReviews.institutionId, institutionId))
      .orderBy(desc(foundationReviews.id)),
  ]);
  const files = versionRows.length
    ? await db
        .select()
        .from(evidence)
        .where(
          inArray(
            evidence.id,
            versionRows.map((version) => version.evidenceId),
          ),
        )
    : [];
  return {
    institutionId,
    deadline: cycle.foundationDeadline,
    indicators: foundationKindSchema.options.map((kind) => {
      const versions = versionRows.filter((version) => version.kind === kind);
      const active = versions.find((version) => version.status === 'active');
      const reviews = reviewRows.filter((candidate) => candidate.kind === kind);
      // The latest review of the active version gives current credit; a review of a superseded
      // or withdrawn version cannot (AT28). Earlier reviews stay as history.
      const review = active
        ? reviews.find((candidate) => candidate.versionId === active.id)
        : undefined;
      const atCutoff = versionAtCutoff(versions, cycle.evaluationCutoff);
      const cutoffReview = reviewAtCutoff(reviews, atCutoff);
      const maxPoints = profile.weights[weightKey[kind]];
      return {
        kind,
        label: foundationLabels[kind],
        maxPoints,
        checks: profile.checklists[weightKey[kind]],
        mode:
          kind === 'procedures' ? profile.proceduresMode : ('scored' as const),
        versions: versions.map((version) => ({
          id: version.id,
          kind: version.kind,
          version: version.version,
          evidence: toEvidenceItem(
            files.find((item) => item.id === version.evidenceId)!,
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
