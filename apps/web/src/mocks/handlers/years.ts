import { http, HttpResponse } from 'msw';
import {
  buildYear,
  financialYearCreateSchema,
  financialYearDiscardSchema,
  financialYearUpdateSchema,
  proposeYear,
  summarizeYearChange,
  yearDate,
  yearEnd,
  yearInput,
  yearIssues,
  type FinancialYear,
  type FinancialYearInput,
  type FinancialYears,
} from '@cpi/contracts';
import type { MockUser } from '@cpi/contracts/fixtures';
import type { z } from 'zod';
import { commit, getDb, type MockDb } from '../db';
import { audit } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireRole } from '../services/session';

/*
 * Financial years (HP2-100, PRD §7.1, FR02), as the real API serves them: the active year and
 * the next one planned ahead. A planned year is kept apart from the active cycle, so planning
 * never changes the active year's deadlines, reports or scores.
 */

function state(db: MockDb): FinancialYears {
  const { cycle } = db;
  const profileName = (id: string) =>
    db.profiles.find((profile) => profile.id === id)?.name ?? id;
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
  };
  const upcoming = db.plannedYears.map((year): FinancialYear => ({
    ...year,
    status: 'planned',
    timezone: cycle.timezone,
    endsOn: yearEnd(year.startsOn),
    profileName: profileName(year.profileId),
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
    years: [active, ...upcoming].sort((a, b) =>
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
];
