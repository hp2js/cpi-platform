import { http, HttpResponse } from 'msw';
import {
  calendarUpdateSchema,
  institutionUpdateSchema,
  profileUpdateSchema,
  userCreateSchema,
  userStatusSchema,
  type CalendarSettings,
  type People,
  type ProfilesState,
} from '@cpi/contracts';
import type { z } from 'zod';
import { commit, getDb, nextId, type MockDb } from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';
import type { MockProfile } from '@cpi/contracts/fixtures';
import { skipPastBoundaries } from '../services/clock';
import {
  assignedOfficers,
  audit,
  institutionUsers,
  notify,
} from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import {
  activeWeights,
  profileIssues,
  profileLock,
  toProfile,
} from '../services/profiles';
import { requireRole } from '../services/session';

/**
 * Administrator settings (PRD §7.1, FR01, FR02, §10.1). Every change is audited; values that
 * would rewrite history (an opened period's deadline, a locked profile) are refused.
 */

const fieldErrors = (error: z.ZodError) =>
  Object.fromEntries(
    error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );

async function body<T>(request: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success)
    throw apiError(
      422,
      'Some values need attention.',
      'invalid_settings',
      fieldErrors(parsed.error),
    );
  return parsed.data;
}

function profilesState(): ProfilesState {
  const db = getDb();
  const lockedReason = profileLock(db);
  return {
    cycleProfileId: db.cycleProfileId,
    locked: lockedReason !== null,
    lockedReason,
    profiles: db.profiles.map((profile) => toProfile(profile, db)),
  };
}

function findProfile(id: unknown) {
  const profile = getDb().profiles.find((candidate) => candidate.id === id);
  if (!profile) throw notFound();
  return profile;
}

function uniqueName(db: MockDb, base: string) {
  const taken = new Set(db.profiles.map((profile) => profile.name));
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${base} copy` : `${base} copy ${n}`;
    if (!taken.has(name)) return name;
  }
}

/* ---------- Calendar ---------- */

const endOfDay = (date: string) => `${date}T23:59:59+03:00`;
const dateOf = (instant: string) => instant.slice(0, 10);
const opensAt = (endsOn: string) =>
  Date.parse(`${endsOn}T23:59:59+03:00`) + 1000;
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

function calendar(): CalendarSettings {
  const db = getDb();
  const now = Date.parse(db.businessTime);
  const { cycle } = db;
  return {
    cycleId: cycle.id,
    label: cycle.label,
    timezone: cycle.timezone,
    periods: cycle.periods.map((period) => {
      const opened = now >= opensAt(period.endsOn);
      return {
        id: period.id,
        label: period.label,
        startsOn: period.startsOn,
        endsOn: period.endsOn,
        deadlineDate: dateOf(period.submissionDeadline),
        lock: opened
          ? {
              editable: false,
              reason: `${period.label} reporting has opened, so its deadline is fixed; lateness cannot be changed retroactively (FR02).`,
            }
          : { editable: true, reason: null },
      };
    }),
    foundationDeadlineDate: dateOf(cycle.foundationDeadline),
    foundationLock:
      now > Date.parse(cycle.foundationDeadline)
        ? {
            editable: false,
            reason:
              'The foundation deadline has passed, so it is fixed (FR02).',
          }
        : { editable: true, reason: null },
    evaluationCutoffDate: dateOf(cycle.evaluationCutoff),
    cutoffLock:
      now > Date.parse(cycle.evaluationCutoff)
        ? {
            editable: false,
            reason: 'The evaluation cutoff has passed, so it is fixed.',
          }
        : { editable: true, reason: null },
    reminders: structuredClone(db.reminders),
    changes: [...db.calendarChanges].reverse(),
  };
}

/* ---------- People ---------- */

function people(): People {
  const db = getDb();
  return {
    users: db.users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId ?? null,
      active: user.active,
      assignedInstitutionIds: db.assignments
        .filter(
          (assignment) =>
            assignment.officerId === user.id && assignment.validTo === null,
        )
        .map((assignment) => assignment.institutionId),
    })),
    institutions: db.institutions.map((institution) => ({
      ...institution,
      focalContact: db.institutionContacts[institution.id]?.focalContact ?? '',
      accountingOfficerContact:
        db.institutionContacts[institution.id]?.accountingOfficerContact ?? '',
    })),
  };
}

export const settingsHandlers = [
  /* Scoring profiles: administrators manage them; supervisors can read the active rules. */
  http.get('/api/settings/profiles', async () => {
    await networkDelay();
    requireRole('administrator', 'supervisor');
    return HttpResponse.json(profilesState());
  }),

  http.post('/api/settings/profiles', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const { basedOn } = (await request.json().catch(() => ({}))) as {
      basedOn?: string;
    };
    const source = findProfile(basedOn);
    let created: MockProfile | undefined;
    commit((db) => {
      created = {
        ...structuredClone(source),
        id: nextId('profile'),
        name: uniqueName(db, source.name.replace(/ \(reference\)$/, '')),
        version: 1,
        status: 'draft',
        basedOn: source.id,
        createdAt: db.businessTime,
        createdBy: user.displayName,
        approvedAt: null,
        approvedBy: null,
      };
      db.profiles.push(created);
      audit(
        db,
        user,
        'profile.create',
        { type: 'scoring_profile', id: created.id, version: 1 },
        `Draft copied from ${source.name}`,
      );
    });
    return HttpResponse.json(toProfile(created!), { status: 201 });
  }),

  http.put('/api/settings/profiles/:profileId', async ({ params, request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const profile = findProfile(params.profileId);
    if (profile.status !== 'draft')
      return apiError(
        409,
        'Only a draft profile can be edited. Copy it to make changes.',
        'profile_immutable',
      );
    const update = await body(request, profileUpdateSchema);
    commit((db) => {
      Object.assign(profile, update);
      audit(
        db,
        user,
        'profile.update',
        { type: 'scoring_profile', id: profile.id, version: profile.version },
        `Draft ${profile.name} edited`,
      );
    });
    return HttpResponse.json(toProfile(profile));
  }),

  http.delete('/api/settings/profiles/:profileId', async ({ params }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const profile = findProfile(params.profileId);
    if (profile.status !== 'draft')
      return apiError(
        409,
        'Approved and reference profiles are kept for the record.',
        'profile_immutable',
      );
    commit((db) => {
      db.profiles = db.profiles.filter(
        (candidate) => candidate.id !== profile.id,
      );
      audit(
        db,
        user,
        'profile.delete',
        { type: 'scoring_profile', id: profile.id, version: profile.version },
        `Draft ${profile.name} deleted`,
      );
    });
    return HttpResponse.json(profilesState());
  }),

  http.post('/api/settings/profiles/:profileId/approve', async ({ params }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const profile = findProfile(params.profileId);
    if (profile.status !== 'draft')
      return apiError(
        409,
        'Only a draft profile can be approved.',
        'profile_immutable',
      );
    const issues = profileIssues(profile);
    if (issues.length)
      return apiError(
        422,
        'The profile cannot be approved yet. Fix the listed issues and try again.',
        'profile_invalid',
        Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
      );
    commit((db) => {
      profile.status = 'approved';
      profile.approvedAt = db.businessTime;
      profile.approvedBy = user.displayName;
      audit(
        db,
        user,
        'profile.approve',
        { type: 'scoring_profile', id: profile.id, version: profile.version },
        `${profile.name} approved; it can no longer be edited`,
      );
    });
    return HttpResponse.json(toProfile(profile));
  }),

  http.post('/api/settings/profiles/:profileId/apply', async ({ params }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const profile = findProfile(params.profileId);
    if (profile.status !== 'approved')
      return apiError(
        409,
        'Only an approved profile can be applied to the cycle.',
        'profile_not_approved',
      );
    const locked = profileLock();
    if (locked) return apiError(409, locked, 'profile_locked');
    commit((db) => {
      db.cycleProfileId = profile.id;
      // Draft form versions show the profile's weights as a read-only snapshot.
      for (const form of db.forms)
        if (form.status === 'draft') form.weights = activeWeights(db);
      audit(
        db,
        user,
        'profile.apply',
        { type: 'cycle', id: db.cycle.id },
        `${profile.name} applied to ${db.cycle.label}`,
      );
    });
    return HttpResponse.json(profilesState());
  }),

  /* Reporting calendar (FR02). */
  http.get('/api/settings/calendar', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json(calendar());
  }),

  http.put('/api/settings/calendar', async ({ request }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const update = await body(request, calendarUpdateSchema);
    const current = calendar();
    const errors: Record<string, string> = {};
    const changes: string[] = [];
    const periods = getDb().cycle.periods;
    let previousDeadline: string | null = null;
    for (const period of current.periods) {
      const next = update.deadlines[period.id] ?? period.deadlineDate;
      if (next !== period.deadlineDate) {
        if (!period.lock.editable)
          errors[`deadlines.${period.id}`] = period.lock.reason!;
        else
          changes.push(
            `${period.label} deadline ${period.deadlineDate} → ${next}`,
          );
      }
      if (next < nextDay(period.endsOn))
        errors[`deadlines.${period.id}`] =
          `The deadline must be after the quarter ends on ${period.endsOn}.`;
      if (previousDeadline && next <= previousDeadline)
        errors[`deadlines.${period.id}`] =
          'Each deadline must fall after the previous quarter’s deadline.';
      previousDeadline = next;
    }
    if (update.foundationDeadlineDate !== current.foundationDeadlineDate) {
      if (!current.foundationLock.editable)
        errors.foundationDeadlineDate = current.foundationLock.reason!;
      else
        changes.push(
          `Foundation deadline ${current.foundationDeadlineDate} → ${update.foundationDeadlineDate}`,
        );
    }
    if (update.evaluationCutoffDate !== current.evaluationCutoffDate) {
      if (!current.cutoffLock.editable)
        errors.evaluationCutoffDate = current.cutoffLock.reason!;
      else
        changes.push(
          `Evaluation cutoff ${current.evaluationCutoffDate} → ${update.evaluationCutoffDate}`,
        );
    }
    const q4 =
      update.deadlines[periods[3]!.id] ?? current.periods[3]!.deadlineDate;
    if (update.evaluationCutoffDate <= q4)
      errors.evaluationCutoffDate =
        'The evaluation cutoff must fall after the Q4 deadline.';
    if (JSON.stringify(update.reminders) !== JSON.stringify(current.reminders))
      changes.push(
        `Reminders ${current.reminders.daysBefore.join(', ') || 'none'} → ${update.reminders.daysBefore.join(', ') || 'none'} days before; overdue notice ${update.reminders.overdueNotice ? 'on' : 'off'}`,
      );
    if (Object.keys(errors).length)
      return apiError(
        422,
        'Some calendar values cannot be saved.',
        'calendar_invalid',
        errors,
      );
    if (!changes.length)
      return apiError(422, 'Nothing has changed.', 'no_change');
    const deadlineMoved = changes.some((change) => change.includes('deadline'));
    commit((db) => {
      for (const period of db.cycle.periods) {
        const next = update.deadlines[period.id];
        if (next) period.submissionDeadline = endOfDay(next);
      }
      db.cycle.foundationDeadline = endOfDay(update.foundationDeadlineDate);
      db.cycle.evaluationCutoff = endOfDay(update.evaluationCutoffDate);
      db.reminders = {
        daysBefore: [...update.reminders.daysBefore].sort((a, b) => b - a),
        overdueNotice: update.reminders.overdueNotice,
      };
      skipPastBoundaries(db);
      const summary = changes.join('; ');
      db.calendarChanges.push({
        at: db.businessTime,
        by: user.displayName,
        summary,
        reason: update.reason,
      });
      audit(
        db,
        user,
        'calendar.update',
        { type: 'cycle', id: db.cycle.id },
        `${summary}. Reason: ${update.reason}`,
      );
      if (deadlineMoved) {
        const recipients = [
          ...db.users.filter(
            (candidate) => candidate.active && candidate.role === 'institution',
          ),
          ...db.users.filter(
            (candidate) => candidate.active && candidate.role === 'officer',
          ),
        ];
        notify(
          db,
          `calendar:${db.calendarChanges.length}`,
          'calendar.changed',
          recipients,
          {
            title: 'A reporting deadline has changed',
            body: `${summary}. Reason: ${update.reason}`,
            link: (recipient) =>
              recipient.role === 'institution' ? '/institution' : '/officer',
          },
        );
      }
    });
    return HttpResponse.json(calendar());
  }),

  /* Users and institutions (FR01). */
  http.get('/api/settings/people', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json(people());
  }),

  http.post('/api/settings/users', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const input = await body(request, userCreateSchema);
    const db = getDb();
    if (
      db.users.some(
        (user) => user.email.toLowerCase() === input.email.toLowerCase(),
      )
    )
      return apiError(422, 'Some values need attention.', 'invalid_settings', {
        email: 'Another account already uses this address.',
      });
    if (
      input.institutionId &&
      !db.institutions.some((item) => item.id === input.institutionId)
    )
      return notFound();
    const user: MockUser = {
      id: nextId('user'),
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
      active: true,
    };
    commit((store) => {
      store.users.push(user);
      audit(
        store,
        admin,
        'user.create',
        { type: 'user', id: user.id },
        `${user.displayName} (${user.role}${user.institutionId ? `, ${user.institutionId}` : ''})`,
      );
    });
    return HttpResponse.json(people(), { status: 201 });
  }),

  http.post(
    '/api/settings/users/:userId/status',
    async ({ params, request }) => {
      await networkDelay();
      const admin = requireRole('administrator');
      const input = await body(request, userStatusSchema);
      const db = getDb();
      const user = db.users.find((candidate) => candidate.id === params.userId);
      if (!user) return notFound();
      if (user.id === admin.id)
        return apiError(
          409,
          'You cannot deactivate your own account.',
          'self_deactivation',
        );
      if (!input.active) {
        const assigned = db.assignments.filter(
          (assignment) =>
            assignment.officerId === user.id && assignment.validTo === null,
        );
        if (assigned.length)
          return apiError(
            409,
            `Reassign ${assigned.map((item) => item.institutionId).join(', ')} before deactivating ${user.displayName}.`,
            'officer_has_assignments',
          );
        if (
          user.role === 'administrator' &&
          db.users.filter((u) => u.role === 'administrator' && u.active)
            .length === 1
        )
          return apiError(
            409,
            'At least one administrator must stay active.',
            'last_administrator',
          );
      }
      commit((store) => {
        user.active = input.active;
        audit(
          store,
          admin,
          input.active ? 'user.reactivate' : 'user.deactivate',
          { type: 'user', id: user.id },
          `${user.displayName}: ${input.reason}`,
        );
      });
      return HttpResponse.json(people());
    },
  ),

  http.put(
    '/api/settings/institutions/:institutionId',
    async ({ params, request }) => {
      await networkDelay();
      const admin = requireRole('administrator');
      const input = await body(request, institutionUpdateSchema);
      const db = getDb();
      const institution = db.institutions.find(
        (candidate) => candidate.id === params.institutionId,
      );
      if (!institution) return notFound();
      commit((store) => {
        const previous = institution.name;
        institution.name = input.name;
        institution.type = input.type;
        store.institutionContacts[institution.id] = {
          focalContact: input.focalContact,
          accountingOfficerContact: input.accountingOfficerContact,
        };
        audit(
          store,
          admin,
          'institution.update',
          { type: 'institution', id: institution.id },
          previous === input.name
            ? 'Details updated'
            : `Renamed from ${previous}; the stable ID ${institution.id} is unchanged`,
        );
        if (previous !== input.name)
          notify(
            store,
            `${institution.id}:renamed:${store.sequence}`,
            'institution.renamed',
            [
              ...institutionUsers(institution.id),
              ...assignedOfficers(institution.id),
            ],
            {
              title: `${institution.id} is now ${input.name}`,
              body: 'The display name changed; reports, receipts and results keep the same institution ID.',
              link: null,
            },
          );
      });
      return HttpResponse.json(people());
    },
  ),
];
