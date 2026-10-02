import { http, HttpResponse } from 'msw';
import {
  bulkAssignmentRequestSchema,
  bulkSupervisionRequestSchema,
  elevatedAuditActions,
  supportAccessRequestSchema,
  userRoleChangeSchema,
  type AdminAttention,
  type AuditEvent,
  type AuditPage,
} from '@cpi/contracts';
import { commit, getDb, type MockDb } from '../db';
import { evaluate } from '../services/annual';
import {
  currentAssignment,
  reassignInstitution,
} from '../services/assignments';
import { accountStatus, invitationExpiresAt } from '../services/auth';
import { toCsv } from '@cpi/contracts';
import { audit, institutionUsers, notify } from '../services/events';
import { apiError, notFound } from '../services/http';
import { activeFocalPersons } from '../services/institutions';
import { networkDelay } from '../services/latency';
import { reportBundle } from '../services/reporting';
import {
  assignedInstitutionIds,
  supervisedInstitutionIds,
  supervisorIdOf,
} from '../services/scope';
import { requireRole } from '../services/session';

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Audit events matching the filters in the query string, newest first. */
function filteredAudit(db: MockDb, params: URLSearchParams): AuditEvent[] {
  const objectType = params.get('objectType');
  const action = params.get('action');
  const actor = params.get('actor');
  const from = params.get('from');
  const to = params.get('to');
  const elevated = params.get('elevated') === 'true';
  const needle = params.get('q')?.trim().toLowerCase();
  return db.audit
    .filter(
      (event) =>
        (!objectType || event.objectType === objectType) &&
        (!action || event.action === action) &&
        (!actor || event.actorName === actor) &&
        // Dates are local calendar dates against business time.
        (!from || event.businessTime.slice(0, 10) >= from) &&
        (!to || event.businessTime.slice(0, 10) <= to) &&
        (!elevated ||
          (elevatedAuditActions as readonly string[]).includes(event.action)) &&
        (!needle ||
          `${event.summary} ${event.objectId} ${event.actorName} ${event.action}`
            .toLowerCase()
            .includes(needle)),
    )
    .reverse();
}

export const adminHandlers = [
  /** The audit log, filtered and paged on the server (FR10). */
  http.get('/api/audit', async ({ request }) => {
    await networkDelay();
    requireRole('administrator');
    const db = getDb();
    const params = new URL(request.url).searchParams;
    const events = filteredAudit(db, params);
    const pageSize = Math.min(
      200,
      Math.max(1, Number(params.get('pageSize')) || 50),
    );
    const pages = Math.max(1, Math.ceil(events.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
    const body: AuditPage = {
      events: events.slice((page - 1) * pageSize, page * pageSize),
      total: events.length,
      page,
      pageSize,
      actions: [...new Set(db.audit.map((event) => event.action))].sort(),
      actors: [...new Set(db.audit.map((event) => event.actorName))].sort(),
    };
    return HttpResponse.json(body);
  }),

  /** The same filters as a CSV file for auditors; cells are encoded against formula injection. */
  http.get('/api/audit.csv', async ({ request }) => {
    await networkDelay();
    requireRole('administrator');
    const events = filteredAudit(getDb(), new URL(request.url).searchParams);
    return new HttpResponse(
      toCsv(
        [
          'business_time',
          'actual_time',
          'actor',
          'actor_role',
          'action',
          'object_type',
          'object_id',
          'object_version',
          'summary',
        ],
        events.map((event) => [
          event.businessTime,
          event.actualTime,
          event.actorName,
          event.actorRole,
          event.action,
          event.objectType,
          event.objectId,
          event.objectVersion ?? '',
          event.summary,
        ]),
      ),
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="cpi-audit-log.csv"',
        },
      },
    );
  }),

  /** What needs the administrator now, each with a link to where it is handled (PRD §9). */
  http.get('/api/admin/attention', async () => {
    await networkDelay();
    requireRole('administrator');
    const db = getDb();
    const now = Date.parse(db.businessTime);
    const items: AdminAttention = [];
    const add = (
      id: string,
      count: number,
      title: string,
      detail: string,
      link: string,
    ) => {
      if (count > 0) items.push({ id, count, title, detail, link });
    };
    add(
      'deliveries',
      db.deliveries.filter((delivery) => delivery.status === 'failed').length,
      'Emails failed after three attempts',
      'Retry them from the failure queue once the problem is fixed.',
      '/admin/notifications',
    );
    add(
      'requests',
      db.suggestions.filter((suggestion) => suggestion.status === 'open')
        .length,
      'Reassignment requests waiting',
      'Supervisors’ suggestions and officers’ conflict-of-interest declarations.',
      '/admin/assignments',
    );
    const active = db.institutions.filter((institution) => institution.active);
    add(
      'no-focal',
      active.filter(
        (institution) => activeFocalPersons(db, institution.id).length === 0,
      ).length,
      'Institutions with no active focal person',
      'Nobody can report for them or receive their clarifications.',
      '/admin/institutions',
    );
    add(
      'no-supervisor',
      active.filter((institution) => !supervisorIdOf(institution.id)).length,
      'Institutions without a supervisor',
      'No supervisor sees them. Assign one under Assignments.',
      '/admin/assignments',
    );
    add(
      'no-officer',
      active.filter(
        (institution) =>
          !db.assignments.some(
            (assignment) =>
              assignment.institutionId === institution.id &&
              assignment.validTo === null,
          ),
      ).length,
      'Institutions without a reviewing officer',
      'Nobody reviews their reports. Assign an officer under Assignments.',
      '/admin/assignments',
    );
    add(
      'idle-officers',
      db.users.filter(
        (user) =>
          user.role === 'officer' &&
          user.active &&
          assignedInstitutionIds(user.id).length === 0,
      ).length,
      'Officers with no institutions',
      'Assign them institutions, or deactivate accounts no longer needed.',
      '/admin/assignments',
    );
    add(
      'expired-invitations',
      db.users.filter((user) => {
        const expires = invitationExpiresAt(user);
        return expires !== null && Date.parse(expires) < Date.now();
      }).length,
      'Invitations that expired unused',
      'Send a new invitation from the Users page.',
      '/admin/users',
    );
    add(
      'no-form',
      db.forms.some((form) => form.status === 'published') ? 0 : 1,
      'No report form is published',
      'Institutions cannot report until a form version is published.',
      '/admin/forms',
    );
    if (now > Date.parse(db.cycle.evaluationCutoff))
      add(
        'ready',
        active.filter(
          (institution) =>
            evaluate(institution.id).releasable &&
            !db.publications.some(
              (publication) =>
                publication.institutionId === institution.id &&
                publication.supersededBy === null,
            ),
        ).length,
        'Results ready to publish',
        'Every quarter has a final disposition. Publish them as a batch.',
        '/admin/annual',
      );
    return HttpResponse.json(items);
  }),

  /**
   * Read-only support access to an institution's report as it stands, including an unsaved
   * draft (PRD §5.2: "logged support access only"). Each view needs a reason, is audited, and
   * the institution is told. Administrators never edit or submit on an institution's behalf.
   */
  http.post(
    '/api/support/obligations/:obligationId',
    async ({ params, request }) => {
      await networkDelay();
      const admin = requireRole('administrator');
      const parsed = supportAccessRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Give the support reason in at least 20 characters.',
          'invalid_request',
          { reason: 'Give the support reason in at least 20 characters.' },
        );
      const db = getDb();
      const obligation = db.obligations.find(
        (candidate) => candidate.id === params.obligationId,
      );
      if (!obligation) return notFound();
      const bundle = reportBundle(obligation);
      commit((store) => {
        audit(
          store,
          admin,
          'support.draft_view',
          {
            type: 'obligation',
            id: obligation.id,
            version: bundle.draft?.version ?? null,
          },
          `Support view of ${obligation.id}: ${parsed.data.reason}`,
        );
        notify(
          store,
          `${obligation.id}:support:${store.sequence}`,
          'support.access',
          institutionUsers(obligation.institutionId),
          {
            title: `An administrator viewed your ${bundle.period.label} report for support`,
            body: `${admin.displayName}: ${parsed.data.reason}. Nothing was changed.`,
            link: `/institution/reports/${bundle.period.id}`,
          },
        );
      });
      return HttpResponse.json(bundle);
    },
  ),

  /** Many institutions to one officer; each keeps its own history entry and notifications. */
  http.post('/api/assignments/bulk', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const parsed = bulkAssignmentRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose institutions, an officer and a reason of at least 10 characters.',
        'invalid_request',
      );
    const db = getDb();
    const officer = db.users.find(
      (user) =>
        user.id === parsed.data.officerId &&
        user.role === 'officer' &&
        user.active,
    );
    if (!officer) return notFound();
    const unknown = parsed.data.institutionIds.filter(
      (id) => !currentAssignment(db, id),
    );
    if (unknown.length)
      return apiError(
        422,
        `Unknown institutions: ${unknown.join(', ')}.`,
        'invalid_request',
      );
    const changed = parsed.data.institutionIds.filter(
      (id) => currentAssignment(db, id)!.officerId !== officer.id,
    );
    const unchanged = parsed.data.institutionIds.filter(
      (id) => !changed.includes(id),
    );
    commit((store) => {
      for (const institutionId of changed)
        reassignInstitution(store, {
          institutionId,
          officer,
          reason: parsed.data.reason,
          actor: admin,
          handoverNote: parsed.data.handoverNote,
        });
    });
    return HttpResponse.json({ changed, unchanged });
  }),

  http.post('/api/supervision/bulk', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const parsed = bulkSupervisionRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose institutions, a supervisor and a reason of at least 10 characters.',
        'invalid_request',
      );
    const db = getDb();
    const supervisor = db.users.find(
      (user) =>
        user.id === parsed.data.supervisorId &&
        user.role === 'supervisor' &&
        user.active,
    );
    if (!supervisor) return notFound();
    const unknown = parsed.data.institutionIds.filter(
      (id) => !db.institutions.some((institution) => institution.id === id),
    );
    if (unknown.length)
      return apiError(
        422,
        `Unknown institutions: ${unknown.join(', ')}.`,
        'invalid_request',
      );
    const changed = parsed.data.institutionIds.filter(
      (id) => supervisorIdOf(id) !== supervisor.id,
    );
    const unchanged = parsed.data.institutionIds.filter(
      (id) => !changed.includes(id),
    );
    commit((store) => {
      for (const institutionId of changed) {
        const current = store.supervisions.find(
          (record) =>
            record.institutionId === institutionId && record.validTo === null,
        );
        if (current) current.validTo = store.businessTime;
        store.supervisions.push({
          institutionId,
          supervisorId: supervisor.id,
          validFrom: store.businessTime,
          validTo: null,
          reason: parsed.data.reason,
        });
        audit(
          store,
          admin,
          'supervision.change',
          { type: 'supervision', id: institutionId },
          `${institutionId} supervised by ${supervisor.displayName}: ${parsed.data.reason}`,
        );
      }
      if (changed.length)
        notify(
          store,
          `bulk-supervision:${store.sequence}`,
          'supervision.changed',
          [supervisor],
          {
            title: `${plural(changed.length, 'institution is', 'institutions are')} now in your oversight`,
            body: `${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''}. ${parsed.data.reason}`,
            link: '/supervisor/institutions',
          },
        );
    });
    return HttpResponse.json({ changed, unchanged });
  }),

  /**
   * Changes an account's role, keeping one identity and its history. Scope must be handed over
   * first; the session ends so the new permissions apply at the next sign-in.
   */
  http.put('/api/settings/users/:userId/role', async ({ params, request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const parsed = userRoleChangeSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Choose a role and give a reason of at least 10 characters.',
        'invalid_request',
      );
    const db = getDb();
    const user = db.users.find((candidate) => candidate.id === params.userId);
    if (!user) return notFound();
    const { role, institutionId, reason } = parsed.data;
    if (user.id === admin.id)
      return apiError(
        409,
        'You cannot change your own role.',
        'self_role_change',
      );
    if (
      user.role === role &&
      (role !== 'institution' || user.institutionId === institutionId)
    )
      return apiError(409, 'That is already their role.', 'no_change');
    if (
      role === 'institution' &&
      !db.institutions.some((item) => item.id === institutionId)
    )
      return apiError(
        422,
        'Choose the institution they will report for.',
        'invalid_request',
        {
          institutionId: 'Choose the institution they will report for.',
        },
      );
    const assigned = assignedInstitutionIds(user.id);
    if (user.role === 'officer' && assigned.length)
      return apiError(
        409,
        `Reassign ${assigned.length > 4 ? `${assigned.length} institutions` : assigned.join(', ')} before changing ${user.displayName}’s role.`,
        'officer_has_assignments',
      );
    const supervised = supervisedInstitutionIds(user.id);
    if (user.role === 'supervisor' && supervised.length)
      return apiError(
        409,
        `Assign another supervisor to ${supervised.length > 4 ? `${supervised.length} institutions` : supervised.join(', ')} before changing ${user.displayName}’s role.`,
        'supervisor_has_institutions',
      );
    for (const guarded of ['administrator', 'supervisor'] as const)
      if (
        user.role === guarded &&
        user.active &&
        db.users.filter((u) => u.role === guarded && u.active).length === 1
      )
        return apiError(
          409,
          `At least one ${guarded} must stay active.`,
          `last_${guarded}`,
        );
    if (
      user.role === 'institution' &&
      user.institutionId &&
      accountStatus(user) === 'active' &&
      activeFocalPersons(db, user.institutionId).length === 1
    )
      return apiError(
        409,
        `${user.displayName} is the only active focal person for ${user.institutionId}. Set up another before changing their role.`,
        'last_focal_person',
      );
    const before = user.role;
    commit((store) => {
      const target = store.users.find((candidate) => candidate.id === user.id)!;
      target.role = role;
      target.institutionId =
        role === 'institution' ? (institutionId ?? undefined) : undefined;
      // New permissions apply from the next sign-in.
      if (store.session?.userId === target.id) store.session = null;
      audit(
        store,
        admin,
        'user.role_change',
        { type: 'user', id: target.id },
        `${target.displayName}: ${before} → ${role}${role === 'institution' ? ` (${institutionId})` : ''}. ${reason}`,
      );
    });
    return HttpResponse.json({ ok: true });
  }),
];
