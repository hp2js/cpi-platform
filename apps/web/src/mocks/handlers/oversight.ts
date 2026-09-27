import { http, HttpResponse } from 'msw';
import type { Metric, Oversight } from '@cpi/contracts';
import { getDb } from '../db';
import { networkDelay } from '../services/latency';
import { baselineOf, periodOf } from '../services/reporting';
import { format2, mul, rational, sum } from '../services/rational';
import { readableInstitutionIds } from '../services/scope';
import { scoreSummary } from '../services/scoring';
import { requireRole } from '../services/session';
import { activeWeights, profileLabel } from '../services/profiles';

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

/** Dashboard metrics as defined in PRD §4.3, filtered to the caller's authorized scope. */
export const oversightHandlers = [
  http.get('/api/oversight', async ({ request }) => {
    await networkDelay();
    const user = requireRole('supervisor', 'administrator');
    const url = new URL(request.url);
    const periodId = url.searchParams.get('periodId');
    const institutionFilter = url.searchParams.get('institutionId');
    const officerId = url.searchParams.get('officerId');
    const db = getDb();
    const now = Date.parse(db.businessTime);
    const officerOf = (institutionId: string) =>
      db.assignments.find(
        (assignment) =>
          assignment.institutionId === institutionId &&
          assignment.validTo === null,
      )?.officerId;
    const institutions = readableInstitutionIds(user).filter(
      (id) =>
        (!institutionFilter || id === institutionFilter) &&
        (!officerId || officerOf(id) === officerId),
    );
    const obligations = db.obligations.filter(
      (obligation) =>
        institutions.includes(obligation.institutionId) &&
        (!periodId || obligation.periodId === periodId),
    );
    // Future obligations are excluded from due-report rates.
    const due = obligations.filter(
      (obligation) =>
        Date.parse(periodOf(obligation.periodId).submissionDeadline) < now,
    );
    const submitted = (obligation: (typeof obligations)[number]) =>
      obligation.currentRevision !== null;
    const currentSubmissions = obligations.flatMap((obligation) => {
      const submission = db.submissions.find(
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
    const awaitingOfficer = currentSubmissions.filter(
      ({ obligation }) =>
        obligation.state === 'submitted' || obligation.state === 'under_review',
    ).length;
    const awaitingInstitution = obligations.filter(
      (obligation) => obligation.state === 'clarification_requested',
    ).length;
    const closed = obligations.filter(
      (obligation) => obligation.state === 'closed_without_submission',
    ).length;
    const onTime = due.filter(
      (obligation) =>
        obligation.firstSubmittedAt &&
        Date.parse(obligation.firstSubmittedAt) <=
          Date.parse(periodOf(obligation.periodId).submissionDeadline),
    );
    const published = institutions.filter((id) =>
      db.publications.some(
        (publication) =>
          publication.institutionId === id && publication.supersededBy === null,
      ),
    );

    const comparison = finalized.map(({ obligation, submission }) => {
      const milestones =
        baselineOf(obligation.institutionId, obligation.periodId)?.milestones ??
        [];
      const decisions = db.decisions.filter(
        (decision) =>
          decision.submissionId === submission.id &&
          decision.supersededAt === null,
      );
      const score = scoreSummary(
        activeWeights(db).implementation,
        milestones,
        submission.answers,
        submission.evidenceIds,
        decisions,
        submission.revision,
      ).reviewed;
      const fraction =
        score.status === 'calculated'
          ? score.fraction
          : { numerator: 0, denominator: 1 };
      return {
        institutionId: obligation.institutionId,
        institutionName:
          db.institutions.find(
            (institution) => institution.id === obligation.institutionId,
          )?.name ?? '',
        periodLabel: periodOf(obligation.periodId).label,
        reviewed: fraction,
        points: format2(
          mul(
            rational(activeWeights(db).implementation),
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
                  rational(activeWeights(db).implementation),
                  rational(row.reviewed.numerator, row.reviewed.denominator),
                ),
              ),
            ),
            rational(1, comparison.length),
          ),
        )
      : null;

    const workload = db.users
      .filter(
        (candidate) =>
          candidate.role === 'officer' &&
          candidate.active &&
          (!officerId || candidate.id === officerId),
      )
      .map((officer) => {
        const mine = currentSubmissions.filter(
          ({ obligation }) =>
            officerOf(obligation.institutionId) === officer.id,
        );
        const waiting = mine.filter(
          ({ obligation }) =>
            obligation.state === 'submitted' ||
            obligation.state === 'under_review',
        );
        const oldest = waiting
          .map(({ submission }) =>
            Date.parse(
              db.receipts.find(
                (receipt) => receipt.id === submission.receiptId,
              )!.receivedAt,
            ),
          )
          .sort()[0];
        return {
          officerId: officer.id,
          officerName: officer.displayName,
          institutions: institutions.filter(
            (id) => officerOf(id) === officer.id,
          ).length,
          awaitingOfficer: waiting.length,
          awaitingInstitution: mine.filter(
            ({ obligation }) => obligation.state === 'clarification_requested',
          ).length,
          oldestReviewDays:
            oldest === undefined
              ? null
              : Math.floor((now - oldest) / 86_400_000),
          finalized: mine.filter(
            ({ obligation }) => obligation.state === 'finalized',
          ).length,
        };
      });

    const body: Oversight = {
      asOf: db.businessTime,
      profileName: profileLabel(db),
      simulation: true,
      filters: {
        periodId,
        institutionId:
          institutionFilter as Oversight['filters']['institutionId'],
        officerId,
      },
      metrics: [
        metric(
          'submission-coverage',
          'Submission coverage',
          'Due obligations with a received submission ÷ all due obligations',
          due.filter(submitted).length,
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
        awaitingOfficer,
        awaitingInstitution,
        closedNonresponse: closed,
      },
      averageReviewed: {
        points: average,
        maxPoints: activeWeights(db).implementation,
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
    return HttpResponse.json(body);
  }),
];
