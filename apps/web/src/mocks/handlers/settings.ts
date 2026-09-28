import { http, HttpResponse } from 'msw';
import {
  calendarUpdateSchema,
  institutionCreateSchema,
  institutionImportRequestSchema,
  institutionTypeUpdateSchema,
  institutionUpdateSchema,
  userUpdateSchema,
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
import { accountStatus, prepareLink, sendLink } from '../services/auth';
import { supervisedInstitutionIds, supervisorIdOf } from '../services/scope';
import { skipPastBoundaries } from '../services/clock';
import {
  accountingOfficerProblems,
  createInstitution,
  fromCreateRequest,
  institutionProblems,
  activeFocalPersons,
  previewImport,
  type NewInstitution,
} from '../services/institutions';
import { endOfDay, shiftDays } from '../services/days';

/** PRD §9.1: the deadline is a number of counted days after the quarter ends. */
const ruleDeadline = (
  endsOn: string,
  counting: {
    mode: 'calendar' | 'working';
    reportingDays: number;
    holidays: { date: string; name: string }[];
  },
) => shiftDays(endsOn, counting.reportingDays, counting);
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
    dayCounting: structuredClone(cycle.dayCounting),
    ruleDeadlines: Object.fromEntries(
      cycle.periods.map((period) => [
        period.id,
        ruleDeadline(period.endsOn, cycle.dayCounting),
      ]),
    ),
    changes: [...db.calendarChanges].reverse(),
  };
}

/* ---------- People ---------- */

function typeLabelTaken(db: MockDb, label: string, exceptId?: string) {
  const key = label.trim().toLowerCase();
  return db.institutionTypes.some(
    (type) => type.id !== exceptId && type.label.toLowerCase() === key,
  );
}

/** One notice per officer for everything assigned to them in this change. */
function notifyOfficers(db: MockDb, rows: NewInstitution[]) {
  const byOfficer = new Map<string, NewInstitution[]>();
  for (const row of rows)
    byOfficer.set(row.officer!.id, [
      ...(byOfficer.get(row.officer!.id) ?? []),
      row,
    ]);
  for (const [officerId, assigned] of byOfficer) {
    const officer = db.users.find((user) => user.id === officerId)!;
    notify(
      db,
      `onboard:${officerId}:${db.sequence}`,
      'assignment.changed',
      [officer],
      {
        title:
          assigned.length === 1
            ? `${assigned[0]!.id} assigned to you`
            : `${assigned.length} new institutions assigned to you`,
        body: 'New institutions start with proposed baselines of the committee milestones for you to review before each quarter opens.',
        link:
          assigned.length === 1
            ? `/officer/institutions/${assigned[0]!.id}`
            : '/officer',
      },
    );
  }
}

function people(): People {
  const db = getDb();
  return {
    users: db.users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle ?? '',
      institutionId: user.institutionId ?? null,
      active: user.active,
      status: accountStatus(user),
      invitationExpiresAt:
        user.authLink?.purpose === 'invitation'
          ? user.authLink.expiresAt
          : null,
      assignedInstitutionIds:
        user.role === 'supervisor'
          ? supervisedInstitutionIds(user.id)
          : db.assignments
              .filter(
                (assignment) =>
                  assignment.officerId === user.id &&
                  assignment.validTo === null,
              )
              .map((assignment) => assignment.institutionId),
    })),
    institutions: db.institutions.map((institution) => {
      const current = db.assignments.find(
        (assignment) =>
          assignment.institutionId === institution.id &&
          assignment.validTo === null,
      );
      const officer = db.users.find((user) => user.id === current?.officerId);
      const supervisorId = supervisorIdOf(institution.id);
      const supervisor = db.users.find((user) => user.id === supervisorId);
      return {
        ...institution,
        focalPersons: db.users
          .filter(
            (user) =>
              user.role === 'institution' &&
              user.institutionId === institution.id,
          )
          .map((user) => ({
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            jobTitle: user.jobTitle ?? '',
            active: user.active,
            status: accountStatus(user),
            invitationExpiresAt:
              accountStatus(user) === 'invited'
                ? (user.authLink?.expiresAt ?? null)
                : null,
          })),
        officer: officer ? { id: officer.id, name: officer.displayName } : null,
        supervisor: supervisor
          ? { id: supervisor.id, name: supervisor.displayName }
          : null,
      };
    }),
    institutionTypes: db.institutionTypes.map((type) => ({
      ...type,
      institutionCount: db.institutions.filter(
        (institution) => institution.typeId === type.id,
      ).length,
    })),
  };
}

export const settingsHandlers = [
  /* Scoring profiles: administrators manage them; officers and supervisors read the rules in use. */
  http.get('/api/settings/profiles', async () => {
    await networkDelay();
    requireRole('administrator', 'supervisor', 'officer');
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
    const counting = {
      ...update.dayCounting,
      holidays: [...update.dayCounting.holidays].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
    if (
      new Set(counting.holidays.map((day) => day.date)).size !==
      counting.holidays.length
    )
      errors['dayCounting.holidays'] = 'Each holiday date can be listed once.';
    const before = current.dayCounting;
    if (before.mode !== counting.mode)
      changes.push(`Day counting ${before.mode} → ${counting.mode} days`);
    if (before.reportingDays !== counting.reportingDays)
      changes.push(
        `Deadline rule ${before.reportingDays} → ${counting.reportingDays} days after quarter end`,
      );
    if (before.clarificationDays !== counting.clarificationDays)
      changes.push(
        `Clarification window ${before.clarificationDays} → ${counting.clarificationDays} days (new requests only)`,
      );
    if (before.reviewTargetDays !== counting.reviewTargetDays)
      changes.push(
        `Officer review target ${before.reviewTargetDays} → ${counting.reviewTargetDays} days`,
      );
    if (JSON.stringify(before.holidays) !== JSON.stringify(counting.holidays))
      changes.push(
        `Public holidays updated (${counting.holidays.length} listed)`,
      );
    // Unopened quarters can take their deadline from the rule; opened ones are fixed (FR02).
    const deadlines: Record<string, string> = { ...update.deadlines };
    if (update.applyRuleToDeadlines)
      for (const period of current.periods)
        if (period.lock.editable)
          deadlines[period.id] = ruleDeadline(period.endsOn, counting);
    let previousDeadline: string | null = null;
    for (const period of current.periods) {
      const next = deadlines[period.id] ?? period.deadlineDate;
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
    const q4 = deadlines[periods[3]!.id] ?? current.periods[3]!.deadlineDate;
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
        const next = deadlines[period.id];
        if (next) period.submissionDeadline = endOfDay(next);
      }
      db.cycle.dayCounting = counting;
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
    const invitation = await prepareLink('invitation');
    const user: MockUser = {
      id: nextId('user'),
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
      active: true,
      jobTitle: input.jobTitle,
      passwordHash: null,
    };
    commit((store) => {
      store.users.push(user);
      // The person sets their own password from the invitation email.
      sendLink(store, user, invitation, admin);
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
        // Deactivating an institution's last active focal person is allowed (someone who leaves
        // may need locking out at once) but must be confirmed: nobody can then report.
        if (
          user.role === 'institution' &&
          user.institutionId &&
          accountStatus(user) === 'active' &&
          activeFocalPersons(db, user.institutionId).length === 1 &&
          !input.confirmNoFocalPerson
        )
          return apiError(
            409,
            `${user.displayName} is the only active focal person for ${user.institutionId}. Afterwards nobody can report for it or receive its clarifications until someone else is set up.`,
            'last_focal_person',
          );
        // Oversight must not silently lapse: move a supervisor's institutions first.
        const supervised = supervisedInstitutionIds(user.id);
        if (user.role === 'supervisor' && supervised.length)
          return apiError(
            409,
            `Assign another supervisor to ${supervised.length > 4 ? `${supervised.length} institutions` : supervised.join(', ')} before deactivating ${user.displayName}.`,
            'supervisor_has_institutions',
          );
        if (
          user.role === 'supervisor' &&
          db.users.filter((u) => u.role === 'supervisor' && u.active).length ===
            1
        )
          return apiError(
            409,
            'At least one supervisor must stay active.',
            'last_supervisor',
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

  /* Institution types: a managed list; retiring keeps history, renaming updates labels. */
  http.post('/api/settings/institution-types', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const input = await body(request, institutionTypeUpdateSchema);
    const db = getDb();
    if (typeLabelTaken(db, input.label))
      return apiError(422, 'That type already exists.', 'invalid_settings', {
        label: 'That type already exists.',
      });
    const slug = input.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = db.institutionTypes.some((type) => type.id === slug)
      ? `${slug}-${db.sequence + 1}`
      : slug;
    commit((store) => {
      store.institutionTypes.push({
        id,
        label: input.label,
        active: input.active,
      });
      audit(
        store,
        admin,
        'institution_type.create',
        { type: 'institution_type', id },
        input.label,
      );
    });
    return HttpResponse.json(people(), { status: 201 });
  }),

  http.put(
    '/api/settings/institution-types/:typeId',
    async ({ params, request }) => {
      await networkDelay();
      const admin = requireRole('administrator');
      const input = await body(request, institutionTypeUpdateSchema);
      const db = getDb();
      const type = db.institutionTypes.find(
        (item) => item.id === params.typeId,
      );
      if (!type) return notFound();
      if (typeLabelTaken(db, input.label, type.id))
        return apiError(422, 'That type already exists.', 'invalid_settings', {
          label: 'That type already exists.',
        });
      if (
        !input.active &&
        db.institutionTypes.filter((item) => item.active && item.id !== type.id)
          .length === 0
      )
        return apiError(
          409,
          'At least one type must stay active.',
          'last_type',
        );
      commit((store) => {
        const changes = [
          type.label !== input.label && `renamed from ${type.label}`,
          type.active !== input.active &&
            (input.active ? 'reactivated' : 'retired'),
        ].filter(Boolean);
        type.label = input.label;
        type.active = input.active;
        // Institutions show the current label; their type ID never changes.
        for (const institution of store.institutions)
          if (institution.typeId === type.id) institution.type = input.label;
        audit(
          store,
          admin,
          'institution_type.update',
          { type: 'institution_type', id: type.id },
          `${input.label}: ${changes.join(', ') || 'no changes'}`,
        );
      });
      return HttpResponse.json(people());
    },
  ),

  // A new invitation link replaces the earlier one (e.g. it expired or the email was lost).
  http.post('/api/settings/users/:userId/invitation', async ({ params }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const user = getDb().users.find(
      (candidate) => candidate.id === params.userId,
    );
    if (!user) return notFound();
    if (accountStatus(user) !== 'invited')
      return apiError(
        409,
        user.active
          ? 'This person has already set a password.'
          : 'Reactivate the account before inviting again.',
        'not_invited',
      );
    const invitation = await prepareLink('invitation');
    commit((store) => {
      sendLink(store, user, invitation, admin);
      audit(
        store,
        admin,
        'user.invite',
        { type: 'user', id: user.id },
        `Invitation sent again to ${user.email}`,
      );
    });
    return HttpResponse.json(people());
  }),

  http.put('/api/settings/users/:userId', async ({ params, request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const input = await body(request, userUpdateSchema);
    const user = getDb().users.find(
      (candidate) => candidate.id === params.userId,
    );
    if (!user) return notFound();
    commit((store) => {
      const previous = user.displayName;
      user.displayName = input.displayName;
      user.jobTitle = input.jobTitle;
      audit(
        store,
        admin,
        'user.update',
        { type: 'user', id: user.id },
        previous === input.displayName
          ? 'Job title updated'
          : `Renamed from ${previous}`,
      );
    });
    return HttpResponse.json(people());
  }),

  http.post('/api/settings/institutions', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const input = await body(request, institutionCreateSchema);
    const db = getDb();
    const candidate = fromCreateRequest(db, input);
    const problems = institutionProblems(db, candidate);
    if (problems.length)
      return apiError(422, problems.join(' '), 'invalid_institution');
    const invitation = candidate.focalUser
      ? await prepareLink('invitation')
      : undefined;
    commit((store) => {
      createInstitution(
        store,
        admin,
        { ...candidate, officer: candidate.officer! },
        input.seedOpenedQuarters,
        nextId,
        invitation,
      );
      audit(
        store,
        admin,
        'institution.create',
        { type: 'institution', id: candidate.id },
        `${candidate.name}, reviewed by ${candidate.officer!.displayName}; Accounting Officer ${candidate.accountingOfficer.name}`,
      );
      notifyOfficers(store, [candidate]);
    });
    return HttpResponse.json(people(), { status: 201 });
  }),

  http.post(
    '/api/settings/institutions/import/preview',
    async ({ request }) => {
      await networkDelay();
      requireRole('administrator');
      const input = await body(request, institutionImportRequestSchema);
      return HttpResponse.json(previewImport(getDb(), input.csv).preview);
    },
  ),

  // All or nothing: one invalid row means nothing is created, so a file can be fixed and re-run.
  http.post('/api/settings/institutions/import', async ({ request }) => {
    await networkDelay();
    const admin = requireRole('administrator');
    const input = await body(request, institutionImportRequestSchema);
    const { preview, rows } = previewImport(getDb(), input.csv);
    if (preview.fileErrors.length || preview.invalid)
      return apiError(
        422,
        preview.fileErrors[0] ??
          `${preview.invalid} ${preview.invalid === 1 ? 'row needs' : 'rows need'} attention; nothing was imported.`,
        'import_invalid',
      );
    const invitations = await Promise.all(
      rows.map((row) =>
        row.focalUser ? prepareLink('invitation') : Promise.resolve(undefined),
      ),
    );
    commit((store) => {
      rows.forEach((row, index) =>
        createInstitution(
          store,
          admin,
          { ...row, officer: row.officer! },
          input.seedOpenedQuarters,
          nextId,
          invitations[index],
        ),
      );
      audit(
        store,
        admin,
        'institution.import',
        { type: 'institution', id: `${rows[0]!.id}…${rows.at(-1)!.id}` },
        `${rows.length} institutions imported`,
      );
      notifyOfficers(store, rows);
    });
    return HttpResponse.json({
      created: rows.map((row) => row.id),
      focalUsers: rows.filter((row) => row.focalUser).length,
    });
  }),

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
      const type = db.institutionTypes.find((item) => item.id === input.typeId);
      // A retired type may stay on an institution that already has it, but is not newly chosen.
      if (!type || (!type.active && type.id !== institution.typeId))
        return apiError(
          422,
          'Choose an active institution type.',
          'invalid_settings',
          {
            typeId: 'Choose an active institution type.',
          },
        );
      const problems = accountingOfficerProblems(input.accountingOfficer);
      if (problems.length)
        return apiError(422, problems.join(' '), 'invalid_settings');
      commit((store) => {
        const previous = institution.name;
        const changed = [
          previous !== input.name && `renamed from ${previous}`,
          institution.typeId !== type.id &&
            `type ${institution.type} → ${type.label}`,
          JSON.stringify(institution.accountingOfficer) !==
            JSON.stringify(input.accountingOfficer) &&
            'Accounting Officer contact updated',
        ].filter(Boolean);
        institution.name = input.name;
        institution.typeId = type.id;
        institution.type = type.label;
        institution.accountingOfficer = {
          ...input.accountingOfficer,
          email: input.accountingOfficer.email.toLowerCase(),
        };
        audit(
          store,
          admin,
          'institution.update',
          { type: 'institution', id: institution.id },
          changed.length
            ? `${changed.join('; ')}; the stable ID ${institution.id} is unchanged`
            : 'No changes',
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
