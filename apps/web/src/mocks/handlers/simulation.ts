import { http, HttpResponse } from 'msw';
import {
  advanceRequestSchema,
  assignmentChangeRequestSchema,
  type SimulationState,
} from '@cpi/contracts';
import { commit, getDb, resetDb } from '../db';
import { advanceTo, boundaryState } from '../services/clock';
import { audit } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { reassignInstitution, toAssignment } from '../services/assignments';
import { localDate } from '../services/days';
import { readableInstitutionIds } from '../services/scope';
import { requireRole, requireUser } from '../services/session';
import { applySuggestion } from './supervision';
import { runScenario } from '../scenario';

function state(): SimulationState {
  const db = getDb();
  return {
    runId: db.runId,
    businessTime: db.businessTime,
    boundaries: boundaryState(),
    processedEvents: db.processedEvents.length,
  };
}

export const simulationHandlers = [
  http.get('/api/simulation', async () => {
    await networkDelay();
    requireUser();
    return HttpResponse.json(state());
  }),

  http.post('/api/simulation/advance', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = advanceRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    const boundary = parsed.success
      ? boundaryState().find(
          (candidate) => candidate.id === parsed.data.boundaryId,
        )
      : undefined;
    if (!boundary) return notFound();
    if (boundary.passed) return HttpResponse.json(state());
    commit((db) => {
      advanceTo(db, boundary.at);
      audit(
        db,
        user,
        'simulation.advance',
        { type: 'simulation', id: db.runId },
        `Advanced to ${boundary.label}`,
      );
    });
    return HttpResponse.json(state());
  }),

  /** A new run with fresh fixtures; it never touches another run or a real environment (AT24). */
  http.post('/api/simulation/reset', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const { profileId } = ((await request.json().catch(() => null)) ?? {}) as {
      profileId?: string;
    };
    const chosen = profileId
      ? getDb().profiles.find((profile) => profile.id === profileId)
      : undefined;
    if (profileId && chosen?.status !== 'approved')
      return apiError(
        409,
        'A new run can only start with an approved profile.',
        'profile_not_approved',
      );
    const previous = getDb().runId;
    const next = `run-${String(Number(previous.replace(/\D/g, '')) + 1).padStart(3, '0')}`;
    // Settings carry over: the profile library is kept, and a chosen profile applies (§7.1).
    resetDb({ keepProfiles: true });
    commit((db) => {
      db.runId = next;
      db.session = { userId: user.id, expired: false };
      if (chosen) {
        db.cycleProfileId = chosen.id;
        for (const form of db.forms) form.weights = { ...chosen.weights };
      }
      audit(
        db,
        user,
        'simulation.reset',
        { type: 'simulation', id: next },
        `Started ${next}, replacing ${previous}${chosen ? `, with ${chosen.name}` : ''}`,
      );
    });
    return HttpResponse.json(state());
  }),

  http.post('/api/simulation/scenario', async () => {
    requireRole('administrator');
    try {
      const result = await runScenario();
      return HttpResponse.json(result);
    } catch (error) {
      return apiError(
        500,
        error instanceof Error
          ? error.message
          : 'The scenario stopped unexpectedly.',
        'scenario_failed',
      );
    }
  }),

  /** Officers see the history of their current institutions, so they know who came before. */
  http.get('/api/assignments/history', async () => {
    await networkDelay();
    const user = requireRole('administrator', 'supervisor', 'officer');
    const db = getDb();
    const readable = readableInstitutionIds(user);
    return HttpResponse.json(
      db.assignments
        .filter((assignment) => readable.includes(assignment.institutionId))
        .map((assignment) => toAssignment(db, assignment)),
    );
  }),

  /** Reassignment takes effect immediately for access; history keeps earlier reviewers (FR01, AT22). */
  http.post('/api/assignments', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = assignmentChangeRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose an officer and give a reason of at least 10 characters.',
        'invalid_request',
        { reason: 'Give a reason of at least 10 characters.' },
      );
    const db = getDb();
    const officer = db.users.find(
      (candidate) =>
        candidate.id === parsed.data.officerId &&
        candidate.role === 'officer' &&
        candidate.active,
    );
    const current = db.assignments.find(
      (assignment) =>
        assignment.institutionId === parsed.data.institutionId &&
        assignment.validTo === null,
    );
    if (!officer || !current) return notFound();
    if (current.officerId === officer.id)
      return apiError(409, 'This officer is already assigned.', 'no_change');
    const { coverUntil, handoverNote, reason, suggestionId, institutionId } =
      parsed.data;
    if (coverUntil && coverUntil <= localDate(db.businessTime))
      return apiError(422, 'Cover must end after today.', 'invalid_request', {
        coverUntil: 'Choose a date after today.',
      });
    commit((store) => {
      reassignInstitution(store, {
        institutionId,
        officer,
        reason: reason.trim(),
        actor: user,
        coverUntil,
        handoverNote,
      });
      if (suggestionId)
        applySuggestion(
          store,
          suggestionId,
          institutionId,
          user.id,
          `${institutionId} now goes to ${officer.displayName}. ${reason.trim()}`,
        );
    });
    return HttpResponse.json({ ok: true });
  }),
];
