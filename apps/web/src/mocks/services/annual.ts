import {
  reviewAtCutoff,
  versionAtCutoff,
  type VersionAtCutoff,
  type AnnualEvaluation,
  type ComponentScore,
  type FoundationKind,
  type QuarterDisposition,
} from '@cpi/contracts';
import { getDb } from '../db';
import { toClarification } from './clarifications';
import { daysLate } from './obligations';
import { baselineOf, periodOf } from './reporting';
import { scoreSummary } from '@cpi/contracts';
import { points as formatPoints } from '@cpi/contracts';
import { annualTotal, rational, type Rational } from '@cpi/contracts';
import { activeProfile, activeWeights, profileLabel } from './profiles';

const checklistKey = {
  procedures: 'procedures',
  risk_assessment: 'riskAssessment',
  mitigation_plan: 'mitigationPlan',
} as const;

/**
 * Stand-in for the backend's annual evaluation (HP2-29): foundations once, four equally
 * weighted quarters, and pending, never zero, until every disposition is final (PRD §7.6, §10.5).
 */

const kinds: FoundationKind[] = [
  'procedures',
  'risk_assessment',
  'mitigation_plan',
];
const kindLabel: Record<FoundationKind, string> = {
  procedures: 'Procedures',
  risk_assessment: 'Risk assessment',
  mitigation_plan: 'Mitigation plan',
};

export function weights() {
  return activeWeights();
}

function quarterDisposition(
  institutionId: string,
  periodId: string,
): { disposition: QuarterDisposition; fraction: Rational | null } {
  const db = getDb();
  const obligation = db.obligations.find(
    (candidate) =>
      candidate.institutionId === institutionId &&
      candidate.periodId === periodId,
  )!;
  const period = periodOf(periodId);
  const milestones = baselineOf(institutionId, periodId)?.milestones ?? [];
  const submission = db.submissions.find(
    (candidate) =>
      candidate.obligationId === obligation.id &&
      candidate.revision === obligation.currentRevision,
  );
  const late =
    obligation.firstSubmittedAt !== null &&
    Date.parse(obligation.firstSubmittedAt) >
      Date.parse(period.submissionDeadline);
  const base = {
    periodId,
    periodLabel: period.label,
    late,
    daysLate: obligation.firstSubmittedAt
      ? daysLate(obligation.firstSubmittedAt, period.submissionDeadline)
      : null,
    daysLateUnit: db.cycle.dayCounting.mode,
    firstSubmittedAt: obligation.firstSubmittedAt,
    firstCompleteEvidenceAt: obligation.firstCompleteEvidenceAt,
    revision: obligation.currentRevision,
    reviewedBy: submission?.finalizedBy ?? null,
    rejected: [] as QuarterDisposition['rejected'],
    planSize: milestones.length,
    note: null as string | null,
    submissionId: submission?.id ?? null,
    formVersionId: submission?.formVersionId ?? null,
    decisionIds: [] as string[],
    reviewerId: null as string | null,
    reviewedAt: submission?.finalizedAt ?? null,
  };
  if (obligation.state === 'closed_without_submission') {
    const closure = db.closures.find(
      (candidate) => candidate.obligationId === obligation.id,
    );
    base.reviewedBy = closure?.by ?? null;
    base.reviewedAt = closure?.at ?? null;
    base.note = closure ? `Closed without submission: ${closure.reason}` : null;
    // An explicit officer disposition of zero, recorded after the cutoff (§10.5).
    return {
      disposition: {
        ...base,
        status: 'closed_without_submission',
        implementation: {
          numerator: 0,
          denominator: Math.max(1, milestones.length),
        },
      },
      fraction: rational(0),
    };
  }
  if (obligation.state === 'finalized' && submission) {
    const decisions = db.decisions.filter(
      (decision) =>
        decision.submissionId === submission.id &&
        decision.supersededAt === null,
    );
    const score = scoreSummary(
      activeWeights().implementation,
      milestones,
      submission.answers,
      submission.evidenceIds,
      decisions,
      submission.revision,
      profileLabel(),
    ).reviewed;
    const rejected = decisions
      .filter((decision) => decision.outcome === 'rejected')
      .map((decision) => {
        const milestone = milestones.find(
          (candidate) => candidate.id === decision.milestoneId,
        );
        return {
          code: milestone?.code ?? decision.milestoneId,
          title: milestone?.title ?? '',
          reason: decision.reason,
        };
      });
    if (score.status === 'calculated') {
      return {
        disposition: {
          ...base,
          status: 'finalized',
          implementation: score.fraction,
          rejected,
          decisionIds: decisions.map((decision) => decision.id),
        },
        fraction: rational(
          score.fraction.numerator,
          score.fraction.denominator,
        ),
      };
    }
  }
  const status: QuarterDisposition['status'] =
    obligation.state === 'clarification_requested'
      ? 'awaiting_institution'
      : obligation.state === 'submitted' ||
          obligation.state === 'under_review' ||
          obligation.state === 'finalized'
        ? 'awaiting_review'
        : 'not_submitted';
  return {
    disposition: { ...base, status, implementation: null },
    fraction: null,
  };
}

function foundationOutcome(
  institutionId: string,
  kind: FoundationKind,
  maxPoints: number,
) {
  const db = getDb();
  // The version effective at the cutoff counts, never a withdrawn one (§10.3, AT28).
  const atCutoff = versionAtCutoff(
    db.foundationVersions.filter(
      (version) =>
        version.institutionId === institutionId && version.kind === kind,
    ),
    db.cycle.evaluationCutoff,
  );
  // Its latest review (stored newest first), or the unsupported disposition.
  const current = reviewAtCutoff(
    db.foundationReviews.filter(
      (candidate) =>
        candidate.institutionId === institutionId && candidate.kind === kind,
    ),
    atCutoff,
  );
  const score: ComponentScore = current
    ? (() => {
        const passed = current.checks.filter(
          (check) => check.outcome === 'pass',
        ).length;
        return {
          status: 'calculated',
          fraction: { numerator: passed, denominator: 4 },
          maxPoints,
          points: formatPoints(maxPoints, {
            numerator: passed,
            denominator: 4,
          }),
        };
      })()
    : { status: 'pending', maxPoints, reason: 'foundation_not_reviewed' };
  return {
    atCutoff,
    outcome: {
      kind,
      label: kindLabel[kind],
      score,
      versionId: atCutoff.status === 'applicable' ? atCutoff.versionId : null,
      reviewId: current?.id ?? null,
      reviewedBy: current?.reviewedBy ?? null,
      reviewerId: null,
      reviewedAt: current?.reviewedAt ?? null,
      failedChecks: current
        ? current.checks.flatMap((check, index) =>
            check.outcome === 'fail'
              ? [
                  {
                    check:
                      activeProfile().checklists[checklistKey[kind]][index]!,
                    reason: check.reason,
                  },
                ]
              : [],
          )
        : [],
    },
    fraction: current
      ? rational(
          current.checks.filter((check) => check.outcome === 'pass').length,
          4,
        )
      : null,
  };
}

/** Actors are stored by display name, as in the API; this finds the account behind one. */
const accountId = (displayName: string | null) =>
  getDb().users.find((user) => user.displayName === displayName)?.id ?? null;

const pendingReason: Record<VersionAtCutoff['status'], string> = {
  applicable: 'not reviewed on the version effective at the cutoff',
  none: 'has no valid version at the cutoff: record an unsupported disposition or a valid replacement',
  conflict: 'has versions with overlapping effective dates at the cutoff',
};

const statusReason: Record<QuarterDisposition['status'], string> = {
  finalized: '',
  closed_without_submission: '',
  awaiting_review: 'awaiting officer review',
  awaiting_institution: 'awaiting the institution’s clarification response',
  not_submitted: 'not submitted and not yet closed',
};

export function evaluate(institutionId: string): AnnualEvaluation {
  const db = getDb();
  const w = weights();
  const quarters = db.cycle.periods.map((period) =>
    quarterDisposition(institutionId, period.id),
  );
  const foundationMax: Record<FoundationKind, number> = {
    procedures: w.procedures,
    risk_assessment: w.riskAssessment,
    mitigation_plan: w.mitigationPlan,
  };
  const foundations = kinds.map((kind) =>
    foundationOutcome(institutionId, kind, foundationMax[kind]),
  );
  const reasons = [
    ...quarters
      .filter((quarter) => quarter.fraction === null)
      .map(
        (quarter) =>
          `${quarter.disposition.periodLabel} ${statusReason[quarter.disposition.status]}`,
      ),
    ...foundations
      .filter((foundation) => foundation.fraction === null)
      .map(
        (foundation) =>
          `${foundation.outcome.label} ${pendingReason[foundation.atCutoff.status]}`,
      ),
  ];
  let total: AnnualEvaluation['total'];
  if (reasons.length === 0)
    total = annualTotal(
      w,
      Object.fromEntries(
        foundations.map((foundation) => [
          foundation.outcome.kind,
          foundation.fraction!,
        ]),
      ) as Record<FoundationKind, Rational>,
      quarters.map((quarter) => quarter.fraction!),
    );
  else total = { status: 'pending', reasons };

  const publication = db.publications.find(
    (candidate) =>
      candidate.institutionId === institutionId &&
      candidate.supersededBy === null,
  );
  const correction = db.corrections.find(
    (candidate) =>
      candidate.institutionId === institutionId && candidate.closedAt === null,
  );
  const officer = db.assignments.find(
    (assignment) =>
      assignment.institutionId === institutionId && assignment.validTo === null,
  );
  // Clarification windows past the cutoff hold release until an authorized decision (§7.3).
  const extension = db.extensions.find(
    (candidate) => candidate.institutionId === institutionId,
  );
  const extensionRequired = db.clarifications.some(
    (clarification) =>
      clarification.institutionId === institutionId &&
      toClarification(clarification).extensionRequired,
  );
  const holds: string[] = [];
  if (extensionRequired)
    holds.push(
      'A clarification window ends after the evaluation cutoff: record an authorized extension, or the result stays pending.',
    );
  if (extension && Date.parse(db.businessTime) <= Date.parse(extension.until))
    holds.push(
      `Evaluation extended to ${extension.until.slice(0, 10)}: release waits until the extension ends.`,
    );
  return {
    institutionId,
    institutionName:
      db.institutions.find((institution) => institution.id === institutionId)
        ?.name ?? institutionId,
    officerName:
      db.users.find((user) => user.id === officer?.officerId)?.displayName ??
      'Unassigned',
    quarters: quarters.map(({ disposition }) => ({
      ...disposition,
      reviewerId: accountId(disposition.reviewedBy),
    })),
    foundations: foundations.map(({ outcome }) => ({
      ...outcome,
      reviewerId: accountId(outcome.reviewedBy),
    })),
    weights: { ...activeWeights() },
    scoringProfile: {
      id: activeProfile().id,
      name: activeProfile().name,
      version: activeProfile().version,
      simulation: activeProfile().simulation,
    },
    total,
    releasable: total.status === 'calculated' && holds.length === 0,
    extension: extension
      ? {
          until: extension.until,
          reason: extension.reason,
          authorizedBy: extension.authorizedBy,
          recordedBy: extension.recordedBy,
          recordedAt: extension.recordedAt,
        }
      : null,
    extensionRequired,
    holds,
    publication: publication
      ? {
          id: publication.id,
          version: publication.version,
          publishedAt: publication.publishedAt,
          points: publication.points,
          // Reopened or changed since release: the published result no longer reflects decisions.
          stale:
            total.status !== 'calculated' ||
            total.points !== publication.points,
        }
      : null,
    correction: correction
      ? {
          id: correction.id,
          reason: correction.reason,
          openedBy: correction.openedBy,
          openedAt: correction.openedAt,
          periodId: correction.periodId,
        }
      : null,
  };
}
