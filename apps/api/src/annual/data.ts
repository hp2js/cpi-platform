import { asc, desc, inArray, isNull } from 'drizzle-orm';
import {
  add,
  format2,
  mul,
  points as formatPoints,
  rational,
  scoreSummary,
  sum,
  type AnnualEvaluation,
  type AnnualOverview,
  type ComponentScore,
  type ConsolidatedReport,
  type FoundationKind,
  type Metric,
  type Oversight,
  type PublishedResult,
  type QuarterDisposition,
  type Rational,
} from '@cpi/contracts';
import type { Db } from '../database/db';
import {
  assignments,
  closures,
  extensions,
  foundationReviews,
  foundationVersions,
  publications,
  users,
} from '../database/schema';
import { loadCycle } from '../database/state';
import { foundationLabels } from '../planning/foundations';
import { isReviewOverdue } from '../directory/obligations';
import {
  activeDecisions,
  baselineOf,
  loadReviewData,
  periodOf,
  toDecision,
} from '../review/data';
import { daysLate } from '@cpi/contracts';

/*
 * Annual evaluation (PRD §7.6, §10.5, FR12–FR13): foundations once, four equally weighted
 * quarters, and pending, never zero, until every disposition is final. Ported from the mock
 * API's services over the review records plus the annual ones.
 */

export async function loadAnnualData(db: Db, institutionIds: string[]) {
  const scope = institutionIds.length ? institutionIds : ['(none)'];
  const [
    review,
    cycle,
    closureRows,
    versionRows,
    reviewRows,
    extensionRows,
    assignmentRows,
    userRows,
    publicationRows,
  ] = await Promise.all([
    loadReviewData(db, institutionIds),
    loadCycle(db),
    db.select().from(closures),
    db
      .select()
      .from(foundationVersions)
      .where(inArray(foundationVersions.institutionId, scope)),
    db
      .select()
      .from(foundationReviews)
      .where(inArray(foundationReviews.institutionId, scope))
      .orderBy(desc(foundationReviews.id)),
    db
      .select()
      .from(extensions)
      .where(inArray(extensions.institutionId, scope)),
    db.select().from(assignments).where(isNull(assignments.validTo)),
    db.select().from(users).orderBy(asc(users.id)),
    // Every release, for the consolidated report and institution history.
    db.select().from(publications).orderBy(asc(publications.seq)),
  ]);
  return {
    ...review,
    publications: publicationRows,
    cycle,
    closures: closureRows,
    foundationVersions: versionRows,
    foundationReviews: reviewRows,
    extensions: extensionRows,
    assignments: assignmentRows,
    users: userRows,
  };
}

export type AnnualData = Awaited<ReturnType<typeof loadAnnualData>>;
type PublicationRow = AnnualData['publications'][number];

const checklistKey = {
  procedures: 'procedures',
  risk_assessment: 'riskAssessment',
  mitigation_plan: 'mitigationPlan',
} as const;
const kinds: FoundationKind[] = [
  'procedures',
  'risk_assessment',
  'mitigation_plan',
];

function quarterDisposition(
  data: AnnualData,
  institutionId: string,
  periodId: string,
): { disposition: QuarterDisposition; fraction: Rational | null } {
  const obligation = data.obligations.find(
    (candidate) =>
      candidate.institutionId === institutionId &&
      candidate.periodId === periodId,
  )!;
  const period = periodOf(data, periodId);
  const milestones =
    baselineOf(data, institutionId, periodId)?.milestones ?? [];
  const submission = data.submissions.find(
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
    daysLateUnit: 'calendar' as const,
    firstSubmittedAt: obligation.firstSubmittedAt,
    firstCompleteEvidenceAt: obligation.firstCompleteEvidenceAt,
    revision: obligation.currentRevision,
    reviewedBy: submission?.finalizedBy ?? null,
    rejected: [] as QuarterDisposition['rejected'],
    planSize: milestones.length,
    note: null as string | null,
  };
  if (obligation.state === 'closed_without_submission') {
    const closure = data.closures.find(
      (candidate) => candidate.obligationId === obligation.id,
    );
    base.reviewedBy = closure?.by ?? null;
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
    const decisions = activeDecisions(data, submission).map(toDecision);
    const score = scoreSummary(
      data.profile.weights.implementation,
      milestones,
      submission.answers,
      submission.evidenceIds,
      decisions,
      submission.revision,
      data.profile.name,
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
    if (score.status === 'calculated')
      return {
        disposition: {
          ...base,
          status: 'finalized',
          implementation: score.fraction,
          rejected,
        },
        fraction: rational(
          score.fraction.numerator,
          score.fraction.denominator,
        ),
      };
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
  data: AnnualData,
  institutionId: string,
  kind: FoundationKind,
  maxPoints: number,
) {
  const active = data.foundationVersions.find(
    (version) =>
      version.institutionId === institutionId &&
      version.kind === kind &&
      version.status === 'active',
  );
  // The latest review counts (rows are loaded newest first).
  const review = data.foundationReviews.find(
    (candidate) =>
      candidate.institutionId === institutionId && candidate.kind === kind,
  );
  const current =
    review && active && review.versionId === active.id ? review : undefined;
  const passed = current?.checks.filter(
    (check) => check.outcome === 'pass',
  ).length;
  const score: ComponentScore =
    passed !== undefined
      ? {
          status: 'calculated',
          fraction: { numerator: passed, denominator: 4 },
          maxPoints,
          points: formatPoints(maxPoints, {
            numerator: passed,
            denominator: 4,
          }),
        }
      : { status: 'pending', maxPoints, reason: 'foundation_not_reviewed' };
  return {
    outcome: {
      kind,
      label: foundationLabels[kind],
      score,
      versionId: active?.id ?? null,
      failedChecks: current
        ? current.checks.flatMap((check, index) =>
            check.outcome === 'fail'
              ? [
                  {
                    check: data.profile.checklists[checklistKey[kind]][index]!,
                    reason: check.reason,
                  },
                ]
              : [],
          )
        : [],
    },
    fraction: passed !== undefined ? rational(passed, 4) : null,
  };
}

const statusReason: Record<QuarterDisposition['status'], string> = {
  finalized: '',
  closed_without_submission: '',
  awaiting_review: 'awaiting officer review',
  awaiting_institution: 'awaiting the institution’s clarification response',
  not_submitted: 'not submitted and not yet closed',
};

export function evaluate(
  data: AnnualData,
  institutionId: string,
): AnnualEvaluation {
  const w = data.profile.weights;
  const quarters = data.cycle.periods.map((period) =>
    quarterDisposition(data, institutionId, period.id),
  );
  const foundationMax: Record<FoundationKind, number> = {
    procedures: w.procedures,
    risk_assessment: w.riskAssessment,
    mitigation_plan: w.mitigationPlan,
  };
  const foundations = kinds.map((kind) =>
    foundationOutcome(data, institutionId, kind, foundationMax[kind]),
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
          `${foundation.outcome.label} not reviewed on its active version`,
      ),
  ];
  let total: AnnualEvaluation['total'];
  if (reasons.length === 0) {
    const foundationPoints = sum(
      foundations.map((foundation) =>
        mul(
          rational(foundationMax[foundation.outcome.kind]),
          foundation.fraction!,
        ),
      ),
    );
    const average = mul(
      sum(quarters.map((quarter) => quarter.fraction!)),
      rational(1, 4),
    );
    const implementationPoints = mul(rational(w.implementation), average);
    total = {
      status: 'calculated',
      points: format2(add(foundationPoints, implementationPoints)),
      implementationAverage: {
        numerator: Number(average.n),
        denominator: Number(average.d),
      },
      foundationPoints: format2(foundationPoints),
      implementationPoints: format2(implementationPoints),
    };
  } else total = { status: 'pending', reasons };

  const publication = data.publications.find(
    (candidate) =>
      candidate.institutionId === institutionId &&
      candidate.supersededBy === null,
  );
  const correction = data.corrections.find(
    (candidate) =>
      candidate.institutionId === institutionId && candidate.closedAt === null,
  );
  const officer = data.assignments.find(
    (assignment) => assignment.institutionId === institutionId,
  );
  // Clarification windows past the cutoff hold release until an authorized decision (§7.3).
  const extension = data.extensions.find(
    (candidate) => candidate.institutionId === institutionId,
  );
  const extensionRequired = data.clarifications.some(
    (clarification) =>
      clarification.institutionId === institutionId &&
      clarification.extensionRequired,
  );
  const holds: string[] = [];
  if (extensionRequired)
    holds.push(
      'A clarification window ends after the evaluation cutoff: record an authorized extension, or the result stays pending.',
    );
  if (extension && Date.parse(data.businessTime) <= Date.parse(extension.until))
    holds.push(
      `Evaluation extended to ${extension.until.slice(0, 10)}: release waits until the extension ends.`,
    );
  return {
    institutionId,
    institutionName:
      data.institutions.find((institution) => institution.id === institutionId)
        ?.name ?? institutionId,
    officerName:
      data.users.find((user) => user.id === officer?.officerId)?.displayName ??
      'Unassigned',
    quarters: quarters.map((quarter) => quarter.disposition),
    foundations: foundations.map((foundation) => foundation.outcome),
    weights: { ...w },
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

export const cutoffPassed = (data: AnnualData) =>
  Date.parse(data.businessTime) > Date.parse(data.cycle.evaluationCutoff);

export function overview(
  data: AnnualData,
  institutionIds: string[],
): AnnualOverview {
  return {
    cycleLabel: data.cycle.label,
    profileName: data.profile.name,
    simulation: true,
    evaluationCutoff: data.cycle.evaluationCutoff,
    cutoffPassed: cutoffPassed(data),
    asOf: data.businessTime,
    institutions: institutionIds.map((id) => evaluate(data, id)),
  };
}

export function toPublished(
  data: AnnualData,
  publication: PublicationRow,
): PublishedResult {
  return {
    id: publication.id,
    institutionId: publication.institutionId,
    institutionName:
      data.institutions.find(
        (institution) => institution.id === publication.institutionId,
      )?.name ?? publication.institutionId,
    version: publication.version,
    batchId: publication.batchId,
    publishedAt: publication.publishedAt,
    publishedBy: publication.publishedBy,
    status: publication.supersededBy ? 'superseded' : 'current',
    supersededBy: publication.supersededBy,
    correctionReason: publication.correctionReason,
    profileName: publication.profileName,
    simulation: true,
    evaluation: publication.evaluation as PublishedResult['evaluation'],
  };
}

export function consolidated(data: AnnualData): ConsolidatedReport {
  const released = data.publications
    .filter((publication) => publication.supersededBy === null)
    .map((publication) => toPublished(data, publication));
  const unreleased = data.institutions
    .filter(
      (institution) =>
        !released.some((result) => result.institutionId === institution.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((institution) => {
      const evaluation = evaluate(data, institution.id);
      return {
        institutionId: institution.id,
        institutionName: institution.name,
        reasons:
          evaluation.total.status === 'pending'
            ? evaluation.total.reasons
            : ['Ready, not yet published'],
      };
    });
  return {
    schemaVersion: 'cpi-export-1',
    simulation: true,
    generatedAt: data.businessTime,
    cycleLabel: data.cycle.label,
    profileName: data.profile.name,
    released,
    unreleased,
  };
}

export const exportHeader = [
  'schema_version',
  'simulation',
  'cycle_id',
  'scoring_profile_version',
  'institution_id',
  'period_id',
  'submission_revision',
  'indicator_id',
  'maximum_points',
  'earned_points',
  'status',
  'published_at',
  'publication_version',
];

/** Export rows follow the PRD §12.3 contract fields, one row per quarter or foundation component. */
export function exportRows(cycleId: string, results: PublishedResult[]) {
  return results.flatMap((result) => [
    ...result.evaluation.foundations.map((foundation) => [
      'cpi-export-1',
      true,
      cycleId,
      result.profileName,
      result.institutionId,
      '',
      '',
      foundation.kind,
      foundation.score.maxPoints,
      foundation.score.status === 'calculated' ? foundation.score.points : '',
      foundation.score.status,
      result.publishedAt,
      result.version,
    ]),
    ...result.evaluation.quarters.map((quarter) => [
      'cpi-export-1',
      true,
      cycleId,
      result.profileName,
      result.institutionId,
      quarter.periodId,
      quarter.revision ?? '',
      'implementation',
      result.evaluation.weights.implementation / 4,
      quarter.implementation
        ? format2(
            mul(
              rational(result.evaluation.weights.implementation, 4),
              rational(
                quarter.implementation.numerator,
                quarter.implementation.denominator,
              ),
            ),
          )
        : '',
      quarter.status + (quarter.late ? ' (late)' : ''),
      result.publishedAt,
      result.version,
    ]),
  ]);
}

const metric = (
  id: string,
  label: string,
  definition: string,
  numerator: number,
  denominator: number,
): Metric => ({
  id,
  label,
  definition,
  numerator,
  denominator,
  percent:
    denominator === 0
      ? null
      : Math.round((numerator / denominator) * 1000) / 10,
});

/** Dashboard metrics as defined in PRD §4.3, over the caller's authorized scope. */
export function oversight(
  data: AnnualData,
  readable: string[],
  filters: {
    periodId: string | null;
    institutionId: string | null;
    officerId: string | null;
  },
): Oversight {
  const { periodId, institutionId: institutionFilter, officerId } = filters;
  const now = Date.parse(data.businessTime);
  const implementation = data.profile.weights.implementation;
  const officerOf = (institutionId: string) =>
    data.assignments.find(
      (assignment) => assignment.institutionId === institutionId,
    )?.officerId;
  const institutions = readable.filter(
    (id) =>
      (!institutionFilter || id === institutionFilter) &&
      (!officerId || officerOf(id) === officerId),
  );
  const obligations = data.obligations.filter(
    (obligation) =>
      institutions.includes(obligation.institutionId) &&
      (!periodId || obligation.periodId === periodId),
  );
  const deadline = (obligation: (typeof obligations)[number]) =>
    Date.parse(periodOf(data, obligation.periodId).submissionDeadline);
  // Future obligations are excluded from due-report rates.
  const due = obligations.filter((obligation) => deadline(obligation) < now);
  const currentSubmissions = obligations.flatMap((obligation) => {
    const submission = data.submissions.find(
      (candidate) =>
        candidate.obligationId === obligation.id &&
        candidate.revision === obligation.currentRevision,
    );
    return submission ? [{ obligation, submission }] : [];
  });
  const evidenceComplete = currentSubmissions.filter(({ submission }) =>
    Object.values(submission.answers.questions).every(
      (value) => !(value && typeof value === 'object' && value.unavailable),
    ),
  );
  const finalized = currentSubmissions.filter(
    ({ obligation }) => obligation.state === 'finalized',
  );
  const onTime = due.filter(
    (obligation) =>
      obligation.firstSubmittedAt &&
      Date.parse(obligation.firstSubmittedAt) <= deadline(obligation),
  );
  const published = institutions.filter((id) =>
    data.publications.some(
      (publication) =>
        publication.institutionId === id && publication.supersededBy === null,
    ),
  );

  const comparison = finalized.map(({ obligation, submission }) => {
    const milestones =
      baselineOf(data, obligation.institutionId, obligation.periodId)
        ?.milestones ?? [];
    const score = scoreSummary(
      implementation,
      milestones,
      submission.answers,
      submission.evidenceIds,
      activeDecisions(data, submission).map(toDecision),
      submission.revision,
      data.profile.name,
    ).reviewed;
    const fraction =
      score.status === 'calculated'
        ? score.fraction
        : { numerator: 0, denominator: 1 };
    return {
      institutionId: obligation.institutionId,
      institutionName:
        data.institutions.find(
          (institution) => institution.id === obligation.institutionId,
        )?.name ?? '',
      periodLabel: periodOf(data, obligation.periodId).label,
      reviewed: fraction,
      points: format2(
        mul(
          rational(implementation),
          rational(fraction.numerator, fraction.denominator),
        ),
      ),
      planSize: Math.max(1, milestones.length),
    };
  });
  const average = comparison.length
    ? format2(
        mul(
          sum(
            comparison.map((row) =>
              mul(
                rational(implementation),
                rational(row.reviewed.numerator, row.reviewed.denominator),
              ),
            ),
          ),
          rational(1, comparison.length),
        ),
      )
    : null;

  const workload = data.users
    .filter(
      (candidate) =>
        candidate.role === 'officer' &&
        candidate.active &&
        (!officerId || candidate.id === officerId),
    )
    .map((officer) => {
      const mine = currentSubmissions.filter(
        ({ obligation }) => officerOf(obligation.institutionId) === officer.id,
      );
      const waiting = mine.filter(
        ({ obligation }) =>
          obligation.state === 'submitted' ||
          obligation.state === 'under_review',
      );
      const oldest = waiting
        .map(({ submission }) =>
          Date.parse(data.receipts.get(submission.receiptId)!.receivedAt),
        )
        .sort((a, b) => a - b)[0];
      return {
        officerId: officer.id,
        officerName: officer.displayName,
        institutions: institutions.filter((id) => officerOf(id) === officer.id)
          .length,
        awaitingOfficer: waiting.length,
        awaitingInstitution: mine.filter(
          ({ obligation }) => obligation.state === 'clarification_requested',
        ).length,
        oldestReviewDays:
          oldest === undefined ? null : Math.floor((now - oldest) / 86_400_000),
        finalized: mine.filter(
          ({ obligation }) => obligation.state === 'finalized',
        ).length,
      };
    });

  // Quarter by quarter across the whole cycle, independent of the quarter filter.
  const inScope = data.obligations.filter((obligation) =>
    institutions.includes(obligation.institutionId),
  );
  const reviewedPoints = (
    obligation: (typeof obligations)[number],
    submission: (typeof currentSubmissions)[number]['submission'],
  ) => {
    const score = scoreSummary(
      implementation,
      baselineOf(data, obligation.institutionId, obligation.periodId)
        ?.milestones ?? [],
      submission.answers,
      submission.evidenceIds,
      activeDecisions(data, submission).map(toDecision),
      submission.revision,
      data.profile.name,
    ).reviewed;
    return score.status === 'calculated'
      ? mul(
          rational(implementation),
          rational(score.fraction.numerator, score.fraction.denominator),
        )
      : rational(0);
  };
  const trends = data.cycle.periods.map((period) => {
    const quarter = inScope.filter(
      (obligation) => obligation.periodId === period.id,
    );
    const periodDeadline = Date.parse(period.submissionDeadline);
    const dueHere = periodDeadline < now ? quarter : [];
    const current = quarter.flatMap((obligation) => {
      const submission = data.submissions.find(
        (candidate) =>
          candidate.obligationId === obligation.id &&
          candidate.revision === obligation.currentRevision,
      );
      return submission ? [{ obligation, submission }] : [];
    });
    const done = current.filter(
      ({ obligation }) => obligation.state === 'finalized',
    );
    return {
      periodId: period.id,
      periodLabel: period.label,
      due: dueHere.length,
      submitted: dueHere.filter(
        (obligation) => obligation.currentRevision !== null,
      ).length,
      onTime: dueHere.filter(
        (obligation) =>
          obligation.firstSubmittedAt !== null &&
          Date.parse(obligation.firstSubmittedAt) <= periodDeadline,
      ).length,
      finalized: done.length,
      awaitingOfficer: current.filter(
        ({ obligation }) =>
          obligation.state === 'submitted' ||
          obligation.state === 'under_review',
      ).length,
      reviewOverdue: quarter.filter((obligation) =>
        isReviewOverdue(obligation, data.businessTime, data.cycle.dayCounting),
      ).length,
      averagePoints: done.length
        ? format2(
            mul(
              sum(
                done.map(({ obligation, submission }) =>
                  reviewedPoints(obligation, submission),
                ),
              ),
              rational(1, done.length),
            ),
          )
        : null,
    };
  });

  return {
    asOf: data.businessTime,
    profileName: data.profile.name,
    simulation: true,
    trends,
    reviewTarget: {
      days: data.cycle.dayCounting.reviewTargetDays,
      unit: data.cycle.dayCounting.mode,
    },
    filters: {
      periodId,
      institutionId: institutionFilter as Oversight['filters']['institutionId'],
      officerId,
    },
    metrics: [
      metric(
        'submission-coverage',
        'Submission coverage',
        'Due obligations with a received submission ÷ all due obligations',
        due.filter((obligation) => obligation.currentRevision !== null).length,
        due.length,
      ),
      metric(
        'on-time',
        'On-time reporting',
        'Due obligations first submitted by the deadline ÷ all due obligations',
        onTime.length,
        due.length,
      ),
      metric(
        'evidence-completeness',
        'Evidence completeness',
        'Current revisions with every required document supplied ÷ all current revisions',
        evidenceComplete.length,
        currentSubmissions.length,
      ),
      metric(
        'review-coverage',
        'Review coverage',
        'Current revisions with a final officer decision ÷ all current revisions',
        finalized.length,
        currentSubmissions.length,
      ),
      metric(
        'release-coverage',
        'Annual release coverage',
        'Institutions with a current published result ÷ expected institutions',
        published.length,
        institutions.length,
      ),
    ],
    backlog: {
      awaitingOfficer: currentSubmissions.filter(
        ({ obligation }) =>
          obligation.state === 'submitted' ||
          obligation.state === 'under_review',
      ).length,
      awaitingInstitution: obligations.filter(
        (obligation) => obligation.state === 'clarification_requested',
      ).length,
      closedNonresponse: obligations.filter(
        (obligation) => obligation.state === 'closed_without_submission',
      ).length,
    },
    averageReviewed: {
      points: average,
      maxPoints: implementation,
      included: comparison.length,
      expected: obligations.length,
    },
    workload,
    comparison: comparison.sort(
      (a, b) =>
        a.institutionId.localeCompare(b.institutionId) ||
        a.periodLabel.localeCompare(b.periodLabel),
    ),
  };
}
