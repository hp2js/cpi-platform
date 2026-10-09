import { http, HttpResponse } from 'msw';
import {
  buildYear,
  defaultReportIdentity,
  financialYearCreateSchema,
  financialYearDiscardSchema,
  financialYearOpenSchema,
  financialYearUpdateSchema,
  openingReadiness,
  proposeYear,
  summarizeYearChange,
  yearDate,
  yearEnd,
  yearInput,
  yearIssues,
  type FinancialYear,
  type FinancialYearInput,
  type FinancialYears,
  type PublishedResult,
} from '@cpi/contracts';
import type { MockUser } from '@cpi/contracts/fixtures';
import type { z } from 'zod';
import { commit, getDb, type MockDb, type MockPublication } from '../db';
import { audit, notify, usersWithRole } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { readableInstitutionIds } from '../services/scope';
import { requireRole, requireUser } from '../services/session';

/*
 * Financial years (HP2-100, PRD §7.1, FR02), as the real API serves them: the active year, the
 * next one planned ahead, and closed years. A planned year is kept apart from the active cycle,
 * so planning never changes the active year; opening it closes the active year and starts the
 * new one.
 */

const activeInstitutions = (db: MockDb) =>
  db.institutions
    .filter((institution) => institution.active !== false)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));

function state(db: MockDb): FinancialYears {
  const { cycle } = db;
  const profileName = (id: string) =>
    db.profiles.find((profile) => profile.id === id)?.name ?? id;
  const none = { opening: null, closedAt: null, closedBy: null, pending: [] };
  const active: FinancialYear = {
    id: cycle.id,
    label: cycle.label,
    status: 'active',
    timezone: cycle.timezone,
    startsOn: cycle.periods[0]!.startsOn,
    endsOn: cycle.periods[3]!.endsOn,
    foundationDeadline: cycle.foundationDeadline,
    evaluationCutoff: cycle.evaluationCutoff,
    profileId: db.cycleProfileId,
    profileName: profileName(db.cycleProfileId),
    periods: cycle.periods,
    revision: 0,
    plannedBy: null,
    plannedAt: null,
    ...none,
  };
  const opening = openingReadiness(
    cycle,
    activeInstitutions(db),
    db.publications
      .filter((publication) => !publication.supersededBy)
      .map((publication) => publication.institutionId),
    db.businessTime,
  );
  const upcoming = db.plannedYears.map((year): FinancialYear => ({
    ...year,
    status: 'planned',
    timezone: cycle.timezone,
    endsOn: yearEnd(year.startsOn),
    profileName: profileName(year.profileId),
    ...none,
    opening,
  }));
  const past = db.closedYears.map((year): FinancialYear => ({
    ...year,
    status: 'closed',
    revision: 0,
    plannedBy: null,
    plannedAt: null,
    opening: null,
  }));
  const approved = db.profiles.filter(
    (profile) => profile.status === 'approved',
  );
  const proposedProfile = approved.some(
    (profile) => profile.id === db.cycleProfileId,
  )
    ? db.cycleProfileId
    : (approved[0]?.id ?? db.cycleProfileId);
  return {
    years: [...past, active, ...upcoming].sort((a, b) =>
      a.startsOn.localeCompare(b.startsOn),
    ),
    proposal: upcoming.length
      ? null
      : proposeYear(cycle, cycle.dayCounting, proposedProfile),
    profiles: approved.map(({ id, name }) => ({ id, name })),
    changes: [...db.yearChanges].reverse(),
  };
}

const invalidSettings = (error: z.ZodError) =>
  apiError(
    422,
    'Some values need attention.',
    'invalid_settings',
    Object.fromEntries(
      error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    ),
  );

/** Refuses a year that overlaps, precedes the active one, or has dates out of order. */
function issuesFor(input: FinancialYearInput, self?: string) {
  const current = state(getDb());
  const issues = yearIssues(
    input,
    current.years,
    current.profiles.map((profile) => profile.id),
    self,
  );
  return Object.keys(issues).length
    ? apiError(422, 'Check the highlighted dates.', 'invalid_year', issues)
    : undefined;
}

function record(
  db: MockDb,
  user: MockUser,
  action: string,
  yearId: string,
  summary: string,
  reason: string,
) {
  db.yearChanges.push({
    at: db.businessTime,
    by: user.displayName,
    yearId,
    summary,
    reason,
  });
  audit(
    db,
    user,
    action,
    { type: 'financial_year', id: yearId },
    `${summary}. Reason: ${reason}`,
  );
}

const stored = (
  input: FinancialYearInput,
  revision: number,
  plannedAt: string,
  plannedBy: string,
) => {
  const year = buildYear(input);
  return {
    id: year.id,
    label: year.label,
    startsOn: year.startsOn,
    foundationDeadline: year.foundationDeadline,
    evaluationCutoff: year.evaluationCutoff,
    profileId: year.profileId,
    periods: year.periods,
    revision,
    plannedAt,
    plannedBy,
  };
};

const toResult = (
  db: MockDb,
  publication: MockPublication,
): PublishedResult => ({
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
  identity: publication.identity ?? defaultReportIdentity,
  evaluation: publication.evaluation as PublishedResult['evaluation'],
});

/**
 * Closes the active year and opens the planned one: the closed year keeps its calendar and every
 * published result; its working records are cleared. Institutions, people, assignments,
 * profiles, settings and the report identity carry over; plans and foundation documents start
 * afresh, and each institution gets the new year's four quarters on the last published form.
 */
function openYear(
  db: MockDb,
  planned: MockDb['plannedYears'][number],
  active: FinancialYear,
  pending: FinancialYear['pending'],
  closedBy: string,
) {
  db.closedYears.push({
    id: active.id,
    label: active.label,
    timezone: active.timezone,
    startsOn: active.startsOn,
    endsOn: active.endsOn,
    foundationDeadline: active.foundationDeadline,
    evaluationCutoff: active.evaluationCutoff,
    profileId: active.profileId,
    profileName: active.profileName,
    periods: active.periods,
    closedAt: db.businessTime,
    closedBy,
    pending,
  });
  db.archivedPublications.push(
    ...db.publications.map((publication) => ({
      ...publication,
      yearId: active.id,
    })),
  );
  const form = db.forms
    .filter((candidate) => candidate.status === 'published')
    .sort((a, b) => b.version - a.version)[0];
  db.cycle = {
    ...db.cycle,
    id: planned.id,
    label: planned.label,
    foundationDeadline: planned.foundationDeadline,
    evaluationCutoff: planned.evaluationCutoff,
    periods: planned.periods,
  };
  db.cycleProfileId = planned.profileId;
  db.forms = form
    ? [
        {
          ...form,
          id: `form-${planned.id.toLowerCase()}-v1`,
          cycleId: planned.id,
          version: 1,
          publishedAt: db.businessTime,
          periodIds: planned.periods.map((period) => period.id),
          basedOnVersion: null,
          changes: [],
          revision: 0,
          updatedAt: db.businessTime,
        },
      ]
    : [];
  db.obligations = activeInstitutions(db).flatMap((institution) =>
    planned.periods.map((period) => ({
      id: `${institution.id}:${period.id}`,
      institutionId: institution.id,
      periodId: period.id,
      state: 'not_started' as const,
      currentRevision: null,
      firstSubmittedAt: null,
      firstCompleteEvidenceAt: null,
      lastReceiptAt: null,
    })),
  );
  db.baselines = [];
  db.drafts = [];
  db.evidence = [];
  db.submissions = [];
  db.receipts = [];
  db.decisions = [];
  db.idempotency = {};
  db.clarifications = [];
  db.reopenings = [];
  db.planApprovals = [];
  db.risks = [];
  db.activities = [];
  db.plannedMilestones = [];
  db.amendments = [];
  db.foundationVersions = [];
  db.foundationReviews = [];
  db.closures = [];
  db.publications = [];
  db.corrections = [];
  db.suitability = [];
  db.comments = [];
  db.extensions = [];
  db.calendarChanges = [];
  db.plannedYears = db.plannedYears.filter((year) => year.id !== planned.id);
}

export const yearsHandlers = [
  http.get('/api/financial-years', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json(state(getDb()));
  }),
  http.post('/api/financial-years', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = financialYearCreateSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success) return invalidSettings(parsed.error);
    const refused = issuesFor(parsed.data);
    if (refused) return refused;
    commit((db) => {
      const year = stored(parsed.data, 0, db.businessTime, user.displayName);
      db.plannedYears.push(year);
      record(
        db,
        user,
        'financial_year.plan',
        year.id,
        `Planned ${year.label}: ${yearDate(year.startsOn)} to ${yearDate(yearEnd(year.startsOn))}`,
        parsed.data.reason,
      );
    });
    return HttpResponse.json(state(getDb()));
  }),
  http.put('/api/financial-years/:yearId', async ({ params, request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const current = getDb().plannedYears.find(
      (year) => year.id === params.yearId,
    );
    if (!current) return notFound();
    const parsed = financialYearUpdateSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success) return invalidSettings(parsed.error);
    if (current.revision !== parsed.data.baseRevision)
      return apiError(
        409,
        'Someone changed this year after you opened it. Reload it to see their changes.',
        'version_conflict',
      );
    const refused = issuesFor(parsed.data, current.id);
    if (refused) return refused;
    const name = (id: string) =>
      getDb().profiles.find((profile) => profile.id === id)?.name ?? id;
    const changes = summarizeYearChange(yearInput(current), parsed.data, name);
    if (changes.length)
      commit((db) => {
        // The identifier follows the start date, so a moved year may be stored under a new one.
        const year = stored(
          parsed.data,
          current.revision + 1,
          current.plannedAt,
          current.plannedBy,
        );
        db.plannedYears = [
          ...db.plannedYears.filter((candidate) => candidate.id !== current.id),
          year,
        ];
        record(
          db,
          user,
          'financial_year.update',
          year.id,
          `${year.label}: ${changes.join('; ')}`,
          parsed.data.reason,
        );
      });
    return HttpResponse.json(state(getDb()));
  }),
  http.post(
    '/api/financial-years/:yearId/discard',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('administrator');
      const current = getDb().plannedYears.find(
        (year) => year.id === params.yearId,
      );
      if (!current) return notFound();
      const parsed = financialYearDiscardSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) return invalidSettings(parsed.error);
      commit((db) => {
        db.plannedYears = db.plannedYears.filter(
          (year) => year.id !== current.id,
        );
        record(
          db,
          user,
          'financial_year.discard',
          current.id,
          `Discarded the planned ${current.label}`,
          parsed.data.reason,
        );
      });
      return HttpResponse.json(state(getDb()));
    },
  ),
  http.post(
    '/api/financial-years/:yearId/open',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('administrator');
      const planned = getDb().plannedYears.find(
        (year) => year.id === params.yearId,
      );
      if (!planned) return notFound();
      const parsed = financialYearOpenSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) return invalidSettings(parsed.error);
      const current = state(getDb());
      const opening = current.years.find(
        (year) => year.id === planned.id,
      )!.opening!;
      if (opening.blocker)
        return apiError(409, opening.blocker, 'year_not_complete');
      if (opening.pending.length && !parsed.data.leavePending)
        return apiError(
          422,
          'Confirm that the institutions without a published result stay pending.',
          'pending_not_confirmed',
          {
            leavePending:
              'Confirm that the institutions without a published result stay pending.',
          },
        );
      const active = current.years.find((year) => year.status === 'active')!;
      commit((db) => {
        openYear(db, planned, active, opening.pending, user.displayName);
        const summary = `Opened ${planned.label} and closed ${active.label}${opening.pending.length ? `, with ${opening.pending.length} result${opening.pending.length === 1 ? '' : 's'} left pending` : ''}`;
        record(
          db,
          user,
          'financial_year.open',
          planned.id,
          summary,
          parsed.data.reason,
        );
        notify(
          db,
          `${planned.id}:opened`,
          'financial_year.opened',
          (['institution', 'officer', 'supervisor'] as const).flatMap((role) =>
            usersWithRole(role),
          ),
          {
            title: `${planned.label} is open`,
            body: `${active.label} has closed; its published results stay available. ${planned.label} runs from ${yearDate(planned.startsOn)} to ${yearDate(yearEnd(planned.startsOn))}. Plans and foundation documents start afresh for the new year.`,
            link: (recipient) =>
              recipient.role === 'institution'
                ? '/institution'
                : recipient.role === 'officer'
                  ? '/officer'
                  : '/supervisor',
          },
        );
      });
      return HttpResponse.json(state(getDb()));
    },
  ),
  http.get('/api/financial-years/closed', async () => {
    await networkDelay();
    requireUser();
    return HttpResponse.json(
      state(getDb()).years.filter((year) => year.status === 'closed'),
    );
  }),
  http.get('/api/financial-years/:yearId/results', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    const db = getDb();
    const year = state(db).years.find(
      (candidate) =>
        candidate.id === params.yearId && candidate.status === 'closed',
    );
    if (!year) return notFound();
    const scope = readableInstitutionIds(user);
    return HttpResponse.json({
      year,
      results: db.archivedPublications
        .filter(
          (publication) =>
            publication.yearId === year.id &&
            scope.includes(publication.institutionId),
        )
        .reverse()
        .map((publication) => toResult(db, publication)),
      pending: year.pending.filter((item) =>
        scope.includes(item.institutionId),
      ),
    });
  }),
];
