import { http, HttpResponse } from 'msw';
import {
  closeNonresponseRequestSchema,
  correctionRequestSchema,
  extensionRequestSchema,
  publishRequestSchema,
  type AnnualOverview,
  type ConsolidatedReport,
  type PublishedResult,
} from '@cpi/contracts';
import { commit, getDb, nextId, type MockPublication } from '../db';
import { evaluate } from '../services/annual';
import { effectiveCutoff } from '../services/clarifications';
import { toCsv } from '@cpi/contracts';
import { format2, mul, rational } from '@cpi/contracts';
import {
  assignedOfficers,
  audit,
  institutionUsers,
  notify,
} from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { periodOf } from '../services/reporting';
import {
  assignedInstitutionIds,
  readableInstitutionIds,
} from '../services/scope';
import { requireRole } from '../services/session';
import { profileLabel } from '../services/profiles';

function cutoffPassed() {
  const db = getDb();
  return Date.parse(db.businessTime) > Date.parse(db.cycle.evaluationCutoff);
}

function toPublished(publication: MockPublication): PublishedResult {
  const db = getDb();
  return {
    id: publication.id,
    institutionId: publication.institutionId,
    institutionName:
      db.institutions.find(
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

function overview(institutionIds: string[]): AnnualOverview {
  const db = getDb();
  return {
    cycleLabel: db.cycle.label,
    profileName: profileLabel(),
    simulation: true,
    evaluationCutoff: db.cycle.evaluationCutoff,
    cutoffPassed: cutoffPassed(),
    asOf: db.businessTime,
    institutions: institutionIds.map(evaluate),
  };
}

/** Released and unreleased results within the caller's scope (a supervisor's institutions). */
function consolidated(scope: string[]): ConsolidatedReport {
  const db = getDb();
  const released = db.publications
    .filter(
      (publication) =>
        publication.supersededBy === null &&
        scope.includes(publication.institutionId),
    )
    .map(toPublished);
  const unreleased = db.institutions
    .filter(
      (institution) =>
        scope.includes(institution.id) &&
        !released.some((result) => result.institutionId === institution.id),
    )
    .map((institution) => {
      const evaluation = evaluate(institution.id);
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
    generatedAt: db.businessTime,
    cycleLabel: db.cycle.label,
    profileName: profileLabel(),
    released,
    unreleased,
  };
}

/** Export rows follow the PRD §12.3 contract fields, one row per quarter or foundation component. */
function exportRows(results: PublishedResult[]) {
  const db = getDb();
  return results.flatMap((result) => [
    ...result.evaluation.foundations.map((foundation) => [
      'cpi-export-1',
      true,
      db.cycle.id,
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
      db.cycle.id,
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
const exportHeader = [
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

function csvResponse(name: string, body: string) {
  return new HttpResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

export const annualHandlers = [
  http.get('/api/annual', async () => {
    await networkDelay();
    const user = requireRole('supervisor', 'administrator', 'officer');
    return HttpResponse.json(overview(readableInstitutionIds(user)));
  }),

  http.post('/api/annual/publish', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = publishRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose at least one institution to publish.',
        'invalid_request',
      );
    if (!cutoffPassed())
      return apiError(
        409,
        'Results can be published only after the evaluation cutoff has passed.',
        'cutoff_not_passed',
      );
    const evaluations = parsed.data.institutionIds.map(evaluate);
    const blocked = evaluations.filter((evaluation) => !evaluation.releasable);
    if (blocked.length)
      return apiError(
        422,
        `Not ready for release: ${blocked.map((evaluation) => evaluation.institutionId).join(', ')}.`,
        'not_releasable',
      );
    const unchanged = evaluations.filter(
      (evaluation) =>
        evaluation.publication &&
        !evaluation.publication.stale &&
        !evaluation.correction,
    );
    if (unchanged.length)
      return apiError(
        409,
        `Already published and unchanged: ${unchanged.map((evaluation) => evaluation.institutionId).join(', ')}.`,
        'already_published',
      );
    const needsCase = evaluations.filter(
      (evaluation) => evaluation.publication && !evaluation.correction,
    );
    if (needsCase.length)
      return apiError(
        409,
        `A published result can change only through a correction case: ${needsCase.map((evaluation) => evaluation.institutionId).join(', ')}.`,
        'correction_required',
      );
    commit((db) => {
      const batchId = nextId('batch');
      for (const evaluation of evaluations) {
        const previous = db.publications.find(
          (publication) =>
            publication.institutionId === evaluation.institutionId &&
            publication.supersededBy === null,
        );
        const correction = db.corrections.find(
          (candidate) =>
            candidate.institutionId === evaluation.institutionId &&
            candidate.closedAt === null,
        );
        const snapshot = {
          institutionId: evaluation.institutionId,
          institutionName: evaluation.institutionName,
          officerName: evaluation.officerName,
          quarters: evaluation.quarters,
          foundations: evaluation.foundations,
          weights: evaluation.weights,
          total: evaluation.total,
        };
        const publication: MockPublication = {
          id: nextId('pub'),
          institutionId: evaluation.institutionId,
          version: (previous?.version ?? 0) + 1,
          batchId,
          publishedAt: db.businessTime,
          publishedBy: user.displayName,
          supersededBy: null,
          correctionReason: correction?.reason ?? null,
          // A release keeps the profile it was scored with, even after a later run changes it.
          profileName: profileLabel(db),
          evaluation: structuredClone(snapshot),
          points:
            evaluation.total.status === 'calculated'
              ? evaluation.total.points
              : '',
        };
        db.publications.push(publication);
        // The earlier release stays accessible as superseded (§7.4, AT20).
        if (previous) previous.supersededBy = publication.id;
        if (correction) correction.closedAt = db.businessTime;
        audit(
          db,
          user,
          previous ? 'publication.correct' : 'publication.publish',
          {
            type: 'publication',
            id: publication.id,
            version: publication.version,
          },
          `${evaluation.institutionId} in ${batchId}`,
        );
        notify(
          db,
          publication.id,
          previous ? 'result.corrected' : 'result.published',
          institutionUsers(evaluation.institutionId),
          {
            title: previous
              ? `Corrected ${db.cycle.label} result published`
              : `Your ${db.cycle.label} result is published`,
            body: previous
              ? 'A corrected result replaces the earlier release, which remains available as superseded.'
              : 'Your annual evaluation and its explanation are now available.',
            link: '/institution/results',
          },
        );
      }
    });
    return HttpResponse.json(overview(readableInstitutionIds(user)));
  }),

  http.post('/api/annual/extensions', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = extensionRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Give the new date, who authorized it and a reason of at least 10 characters.',
        'invalid_request',
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
    const db = getDb();
    const { institutionId, untilDate, reason, authorizedBy } = parsed.data;
    if (!db.institutions.some((item) => item.id === institutionId))
      return notFound();
    const until = `${untilDate}T23:59:59+03:00`;
    if (Date.parse(until) <= Date.parse(db.cycle.evaluationCutoff))
      return apiError(
        422,
        'An extension must end after the evaluation cutoff.',
        'invalid_request',
        { untilDate: 'Choose a date after the evaluation cutoff.' },
      );
    // The system never shortens a response window (§7.3).
    const latestWindow = db.clarifications
      .filter((clarification) => clarification.institutionId === institutionId)
      .reduce(
        (latest, clarification) =>
          Math.max(latest, Date.parse(clarification.responseDueAt)),
        0,
      );
    if (Date.parse(until) < latestWindow)
      return apiError(
        422,
        'The extension cannot end before an open clarification window does.',
        'invalid_request',
        {
          untilDate: `Choose ${new Date(latestWindow + 3 * 3_600_000).toISOString().slice(0, 10)} or later.`,
        },
      );
    commit((store) => {
      store.extensions = store.extensions.filter(
        (candidate) => candidate.institutionId !== institutionId,
      );
      store.extensions.push({
        institutionId,
        until,
        reason,
        authorizedBy,
        recordedBy: user.displayName,
        recordedAt: store.businessTime,
      });
      audit(
        store,
        user,
        'evaluation.extension',
        { type: 'institution', id: institutionId },
        `Extended to ${untilDate}, authorized by ${authorizedBy}: ${reason}`,
      );
      notify(
        store,
        `${institutionId}:extension:${store.sequence}`,
        'evaluation.extension',
        [
          ...institutionUsers(institutionId),
          ...assignedOfficers(institutionId),
        ],
        {
          title: `Evaluation extended to ${untilDate} for ${institutionId}`,
          body: 'The extension lets evidence and review finish. It does not change other deadlines or lateness.',
          link: (recipient) =>
            recipient.role === 'institution'
              ? '/institution/reports'
              : `/officer/institutions/${institutionId}`,
        },
      );
    });
    return HttpResponse.json(evaluate(institutionId));
  }),

  http.post('/api/annual/corrections', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = correctionRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose the quarter and give a reason of at least 10 characters.',
        'invalid_request',
        { reason: 'Give a reason of at least 10 characters.' },
      );
    const db = getDb();
    if (
      !db.publications.some(
        (publication) =>
          publication.institutionId === parsed.data.institutionId &&
          publication.supersededBy === null,
      )
    ) {
      return apiError(
        409,
        'Only a published result needs a correction case; before publication the officer can reopen directly.',
        'not_published',
      );
    }
    if (
      db.corrections.some(
        (correction) =>
          correction.institutionId === parsed.data.institutionId &&
          correction.closedAt === null,
      )
    ) {
      return apiError(
        409,
        'A correction case is already open for this institution.',
        'correction_open',
      );
    }
    const correction = {
      id: nextId('corr'),
      institutionId: parsed.data.institutionId,
      periodId: parsed.data.periodId,
      reason: parsed.data.reason.trim(),
      openedBy: user.displayName,
      openedAt: db.businessTime,
      closedAt: null,
    };
    commit((store) => {
      store.corrections.push(correction);
      audit(
        store,
        user,
        'correction.open',
        { type: 'correction', id: correction.id },
        `${correction.institutionId} ${periodOf(correction.periodId).label}: ${correction.reason}`,
      );
      notify(
        store,
        correction.id,
        'correction.opened',
        assignedOfficers(correction.institutionId),
        {
          title: `Correction case opened: ${correction.institutionId} ${periodOf(correction.periodId).label}`,
          body: 'Reopen the finalized review, record the corrected decision and finalize; the administrator then publishes a new version.',
          link: '/officer',
        },
      );
    });
    return HttpResponse.json(overview(readableInstitutionIds(user)), {
      status: 201,
    });
  }),

  http.get('/api/annual/report', async () => {
    await networkDelay();
    const user = requireRole('supervisor', 'administrator');
    return HttpResponse.json(consolidated(readableInstitutionIds(user)));
  }),
  http.get('/api/annual/report.csv', async () => {
    await networkDelay();
    const user = requireRole('supervisor', 'administrator');
    return csvResponse(
      'cpi-consolidated-results.csv',
      toCsv(
        exportHeader,
        exportRows(consolidated(readableInstitutionIds(user)).released),
      ),
    );
  }),

  // Institution: only its own released results; nothing numerical before release (AT18, AT19).
  http.get('/api/results', async () => {
    await networkDelay();
    const user = requireRole('institution');
    const results = getDb()
      .publications.filter(
        (publication) => publication.institutionId === user.institutionId,
      )
      .map(toPublished)
      .reverse();
    return HttpResponse.json({
      released: results.length > 0,
      message: results.length
        ? 'Your published results are shown below.'
        : 'Results are published after annual evaluation. Until then you see the status of each report; your reviewing officer contacts you through clarifications if anything needs fixing.',
      results,
    });
  }),
  http.get('/api/results/export.csv', async () => {
    await networkDelay();
    const user = requireRole('institution');
    const results = getDb()
      .publications.filter(
        (publication) =>
          publication.institutionId === user.institutionId &&
          publication.supersededBy === null,
      )
      .map(toPublished);
    if (!results.length)
      return apiError(
        404,
        'There is no published result to export yet.',
        'not_published',
      );
    return csvResponse(
      `cpi-result-${user.institutionId}.csv`,
      toCsv(exportHeader, exportRows(results)),
    );
  }),

  http.post(
    '/api/obligations/:obligationId/close-nonresponse',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const db = getDb();
      const obligation = db.obligations.find(
        (candidate) => candidate.id === params.obligationId,
      );
      if (
        !obligation ||
        !readableInstitutionIds(user).includes(obligation.institutionId)
      )
        return notFound();
      if (
        user.role !== 'officer' ||
        !assignedInstitutionIds(user.id).includes(obligation.institutionId)
      )
        return apiError(
          403,
          'Only the assigned officer records dispositions.',
          'forbidden',
        );
      const parsed = closeNonresponseRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      // The scheduler never decides this: the officer records it, and only after the cutoff (§7.6).
      if (
        Date.parse(getDb().businessTime) <=
        effectiveCutoff(obligation.institutionId)
      )
        return apiError(
          409,
          'Non-response can be recorded only after the evaluation cutoff.',
          'cutoff_not_passed',
        );
      if (obligation.state !== 'not_started' && obligation.state !== 'draft')
        return apiError(
          409,
          'A report was submitted for this quarter; review it instead.',
          'submitted',
        );
      commit((store) => {
        obligation.state = 'closed_without_submission';
        store.closures.push({
          obligationId: obligation.id,
          reason: parsed.data.reason.trim(),
          by: user.displayName,
          at: store.businessTime,
        });
        audit(
          store,
          user,
          'obligation.close_nonresponse',
          { type: 'obligation', id: obligation.id },
          parsed.data.reason.trim(),
        );
        notify(
          store,
          `${obligation.id}:closed`,
          'obligation.closed',
          institutionUsers(obligation.institutionId),
          {
            title: `${periodOf(obligation.periodId).label} closed without submission`,
            body: 'Your officer recorded non-response for this quarter after the evaluation cutoff.',
            link: '/institution',
          },
        );
      });
      return HttpResponse.json(evaluate(obligation.institutionId));
    },
  ),
];
