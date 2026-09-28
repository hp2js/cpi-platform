import { http, HttpResponse } from 'msw';
import {
  reassignmentSuggestionRequestSchema,
  suggestionDismissRequestSchema,
  supervisionChangeRequestSchema,
  type ReassignmentSuggestion,
  type Supervision,
} from '@cpi/contracts';
import { commit, getDb, nextId, type MockDb, type MockSuggestion } from '../db';
import { audit, notify, usersWithRole } from '../services/events';
import { apiError, forbidden, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import {
  assignedInstitutionIds,
  supervisedInstitutionIds,
} from '../services/scope';
import { requireRole, requireUser } from '../services/session';

const nameOf = (db: MockDb, userId: string | null) =>
  userId === null
    ? null
    : (db.users.find((user) => user.id === userId)?.displayName ?? userId);

const currentOfficerId = (db: MockDb, institutionId: string) =>
  db.assignments.find(
    (assignment) =>
      assignment.institutionId === institutionId && assignment.validTo === null,
  )?.officerId ?? null;

export function toSuggestion(
  db: MockDb,
  suggestion: MockSuggestion,
): ReassignmentSuggestion {
  const { suggestedById, resolvedById, ...rest } = suggestion;
  return {
    ...rest,
    institutionName:
      db.institutions.find(
        (institution) => institution.id === suggestion.institutionId,
      )?.name ?? suggestion.institutionId,
    currentOfficerName: nameOf(db, suggestion.currentOfficerId),
    suggestedOfficerName: nameOf(db, suggestion.suggestedOfficerId),
    suggestedBy: nameOf(db, suggestedById)!,
    resolvedBy: nameOf(db, resolvedById),
  };
}

/** Marks an open suggestion for the institution applied; call inside `commit`. */
export function applySuggestion(
  db: MockDb,
  suggestionId: string,
  institutionId: string,
  resolvedById: string,
  note: string,
) {
  const suggestion = db.suggestions.find(
    (candidate) =>
      candidate.id === suggestionId &&
      candidate.institutionId === institutionId &&
      candidate.status === 'open',
  );
  if (!suggestion) return;
  suggestion.status = 'applied';
  suggestion.resolvedById = resolvedById;
  suggestion.resolvedAt = db.businessTime;
  suggestion.resolutionNote = note;
  const supervisor = db.users.find(
    (user) => user.id === suggestion.suggestedById && user.active,
  );
  if (supervisor)
    notify(
      db,
      `${suggestion.id}:applied`,
      'assignment.suggestion_resolved',
      [supervisor],
      {
        title: `Reassignment applied: ${institutionId}`,
        body: `The administrator applied your suggestion. ${note}`,
        link: '/supervisor/assignments',
      },
    );
}

export const supervisionHandlers = [
  /**
   * Supervisor records. Administrators see all; supervisors, the history of the institutions
   * they currently supervise; officers, the current supervisor of their own institutions.
   */
  http.get('/api/supervision', async () => {
    await networkDelay();
    const user = requireUser();
    if (user.role === 'institution') return forbidden();
    const db = getDb();
    const scope =
      user.role === 'supervisor'
        ? supervisedInstitutionIds(user.id)
        : user.role === 'officer'
          ? assignedInstitutionIds(user.id)
          : null;
    const records = db.supervisions.filter(
      (record) =>
        scope === null ||
        (scope.includes(record.institutionId) &&
          (user.role === 'supervisor' || record.validTo === null)),
    );
    return HttpResponse.json(
      records.map((record): Supervision => ({
        ...record,
        supervisorName: nameOf(db, record.supervisorId)!,
      })),
    );
  }),

  /** Assigns or changes an institution's supervisor; access follows at once (PRD §5.2). */
  http.post('/api/supervision', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const parsed = supervisionChangeRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose a supervisor and give a reason of at least 10 characters.',
        'invalid_request',
        { reason: 'Give a reason of at least 10 characters.' },
      );
    const db = getDb();
    const { institutionId, supervisorId, reason } = parsed.data;
    const supervisor = db.users.find(
      (candidate) =>
        candidate.id === supervisorId &&
        candidate.role === 'supervisor' &&
        candidate.active,
    );
    if (
      !supervisor ||
      !db.institutions.some((institution) => institution.id === institutionId)
    )
      return notFound();
    const current = db.supervisions.find(
      (record) =>
        record.institutionId === institutionId && record.validTo === null,
    );
    if (current?.supervisorId === supervisor.id)
      return apiError(409, 'This supervisor is already assigned.', 'no_change');
    commit((store) => {
      if (current) current.validTo = store.businessTime;
      store.supervisions.push({
        institutionId,
        supervisorId: supervisor.id,
        validFrom: store.businessTime,
        validTo: null,
        reason,
      });
      audit(
        store,
        user,
        'supervision.change',
        { type: 'supervision', id: institutionId },
        `${institutionId} supervised by ${supervisor.displayName}: ${reason}`,
      );
      notify(
        store,
        `${institutionId}:supervised:${store.sequence}`,
        'supervision.changed',
        [supervisor],
        {
          title: `${institutionId} is now in your oversight`,
          body: 'You can see its reports, reviews and results from now on.',
          link: `/supervisor/institutions/${institutionId}`,
        },
      );
    });
    return HttpResponse.json({ ok: true });
  }),

  http.get('/api/assignment-suggestions', async () => {
    await networkDelay();
    const user = requireRole('supervisor', 'administrator');
    const db = getDb();
    return HttpResponse.json(
      db.suggestions
        .filter(
          (suggestion) =>
            user.role === 'administrator' ||
            suggestion.suggestedById === user.id,
        )
        .map((suggestion) => toSuggestion(db, suggestion))
        .reverse(),
    );
  }),

  /** A supervisor suggests a reassignment; only the administrator can apply it. */
  http.post('/api/assignment-suggestions', async ({ request }) => {
    await networkDelay();
    const user = requireRole('supervisor');
    const parsed = reassignmentSuggestionRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Give a reason of at least 10 characters.',
        'invalid_request',
        { reason: 'Give a reason of at least 10 characters.' },
      );
    const { institutionId, suggestedOfficerId, reason } = parsed.data;
    if (!supervisedInstitutionIds(user.id).includes(institutionId))
      return notFound();
    const db = getDb();
    const current = currentOfficerId(db, institutionId);
    if (suggestedOfficerId !== null) {
      const officer = db.users.find(
        (candidate) =>
          candidate.id === suggestedOfficerId &&
          candidate.role === 'officer' &&
          candidate.active,
      );
      if (!officer)
        return apiError(422, 'Choose an active officer.', 'invalid_request', {
          suggestedOfficerId: 'Choose an active officer.',
        });
      if (officer.id === current)
        return apiError(
          422,
          'This officer already reviews the institution.',
          'invalid_request',
          { suggestedOfficerId: 'Choose a different officer.' },
        );
    }
    if (
      db.suggestions.some(
        (suggestion) =>
          suggestion.institutionId === institutionId &&
          suggestion.status === 'open',
      )
    )
      return apiError(
        409,
        'A suggestion for this institution is already waiting for the administrator.',
        'suggestion_open',
      );
    const id = nextId('sug');
    commit((store) => {
      store.suggestions.push({
        id,
        institutionId,
        currentOfficerId: current,
        suggestedOfficerId,
        reason,
        suggestedById: user.id,
        at: store.businessTime,
        status: 'open',
        resolvedById: null,
        resolvedAt: null,
        resolutionNote: null,
      });
      audit(
        store,
        user,
        'assignment.suggest',
        { type: 'assignment', id: institutionId },
        `Suggested reassignment of ${institutionId}: ${reason}`,
      );
      notify(
        store,
        `${id}:suggested`,
        'assignment.suggested',
        usersWithRole('administrator'),
        {
          title: `Reassignment suggested: ${institutionId}`,
          body: `${user.displayName} suggests a different officer. Review it under Assignments.`,
          link: '/admin/assignments',
        },
      );
    });
    return HttpResponse.json(
      toSuggestion(
        getDb(),
        getDb().suggestions.find((s) => s.id === id)!,
      ),
      { status: 201 },
    );
  }),

  http.post(
    '/api/assignment-suggestions/:suggestionId/dismiss',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('administrator');
      const parsed = suggestionDismissRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Explain the decision in at least 10 characters.',
          'invalid_request',
          { note: 'Explain the decision in at least 10 characters.' },
        );
      const db = getDb();
      const suggestion = db.suggestions.find(
        (candidate) => candidate.id === params.suggestionId,
      );
      if (!suggestion) return notFound();
      if (suggestion.status !== 'open')
        return apiError(
          409,
          'This suggestion has already been resolved.',
          'suggestion_resolved',
        );
      commit((store) => {
        const target = store.suggestions.find((s) => s.id === suggestion.id)!;
        target.status = 'dismissed';
        target.resolvedById = user.id;
        target.resolvedAt = store.businessTime;
        target.resolutionNote = parsed.data.note;
        audit(
          store,
          user,
          'assignment.suggestion_dismiss',
          { type: 'assignment', id: target.institutionId },
          `Kept the current officer for ${target.institutionId}: ${parsed.data.note}`,
        );
        const supervisor = store.users.find(
          (candidate) => candidate.id === target.suggestedById,
        );
        if (supervisor?.active)
          notify(
            store,
            `${target.id}:dismissed`,
            'assignment.suggestion_resolved',
            [supervisor],
            {
              title: `Reassignment not applied: ${target.institutionId}`,
              body: parsed.data.note,
              link: '/supervisor/assignments',
            },
          );
      });
      return HttpResponse.json(
        toSuggestion(
          getDb(),
          getDb().suggestions.find((s) => s.id === suggestion.id)!,
        ),
      );
    },
  ),
];
