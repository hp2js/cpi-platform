import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  calendarUpdateSchema,
  institutionCreateSchema,
  institutionImportRequestSchema,
  institutionTypeUpdateSchema,
  institutionUpdateSchema,
  profileUpdateSchema,
  userCreateSchema,
  userRoleChangeSchema,
  userStatusSchema,
  userUpdateSchema,
  type CalendarSettings,
  type People,
  type ProfilesState,
  type ScoringProfile,
} from '@cpi/contracts';
import { CurrentUser, Roles, Sessions, type User } from '../auth/sessions';
import { nextId, write, type Db, type Tx } from '../database/db';
import {
  assignments,
  calendarChanges,
  cycles,
  formVersions,
  institutionTypes,
  institutions,
  periods,
  processedEvents,
  scoringProfiles,
  supervisions,
  users,
} from '../database/schema';
import {
  currentState,
  loadCycle,
  loadForms,
  loadProfiles,
} from '../database/state';
import { sendInvitation } from '../auth/invitations';
import { accountStatus } from '../auth/passwords';
import {
  assignedInstitutionIds,
  supervisedInstitutionIds,
} from '../auth/scope';
import { CONFIG, type AppConfig } from '../config';
import {
  Events,
  assignedOfficers,
  institutionUsers,
  usersWithRole,
} from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import {
  accountingOfficerProblems,
  createInstitution,
  directorySnapshot,
  fromCreateRequest,
  institutionProblems,
  previewImport,
  type NewInstitution,
} from './onboarding';
import {
  boundaries,
  calendarSettings,
  endOfDay,
  nextDay,
  profileIssues,
  profileLockReason,
  ruleDeadline,
  type Profile,
} from './rules';

/**
 * Administrator settings (PRD §7.1, FR01, FR02, §10.1). Every change is audited; values that
 * would rewrite history (an opened period's deadline, a locked profile) are refused.
 */

function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      422,
      'Some values need attention.',
      'invalid_settings',
      Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join('.'),
          issue.message,
        ]),
      ),
    );
  return parsed.data;
}

function toProfile(
  { position, ...profile }: typeof scoringProfiles.$inferSelect,
  profiles: Profile[],
): ScoringProfile {
  return { ...profile, issues: profileIssues(profile, profiles) };
}

async function findProfile(db: Db, id: unknown) {
  const [profile] =
    typeof id === 'string'
      ? await db
          .select()
          .from(scoringProfiles)
          .where(eq(scoringProfiles.id, id))
      : [];
  if (!profile) throw notFound();
  return profile;
}

async function profilesState(db: Db): Promise<ProfilesState> {
  const [{ cycle }, profiles, forms] = await Promise.all([
    currentState(db),
    loadProfiles(db),
    loadForms(db),
  ]);
  const lockedReason = profileLockReason(forms);
  return {
    cycleProfileId: cycle.profileId,
    locked: lockedReason !== null,
    lockedReason,
    profiles: profiles.map((profile) => toProfile(profile, profiles)),
  };
}

async function calendar(db: Db): Promise<CalendarSettings> {
  const [{ state, cycle: row }, cycle, changes] = await Promise.all([
    currentState(db),
    loadCycle(db),
    db
      .select({
        at: calendarChanges.at,
        by: calendarChanges.by,
        summary: calendarChanges.summary,
        reason: calendarChanges.reason,
      })
      .from(calendarChanges)
      .orderBy(desc(calendarChanges.id)),
  ]);
  return calendarSettings(
    cycle,
    state.businessTime,
    { daysBefore: row.reminderDaysBefore, overdueNotice: row.overdueNotice },
    changes,
  );
}

function typeLabelTaken(
  types: { id: string; label: string }[],
  label: string,
  exceptId?: string,
) {
  const key = label.trim().toLowerCase();
  return types.some(
    (type) => type.id !== exceptId && type.label.toLowerCase() === key,
  );
}

async function people(db: Db): Promise<People> {
  const [userRows, current, supervised, institutionRows, typeRows] =
    await Promise.all([
      db.select().from(users).orderBy(asc(users.id)),
      db.select().from(assignments).where(isNull(assignments.validTo)),
      db.select().from(supervisions).where(isNull(supervisions.validTo)),
      db.select().from(institutions).orderBy(asc(institutions.id)),
      db
        .select()
        .from(institutionTypes)
        .orderBy(asc(institutionTypes.position)),
    ]);
  const invitationExpiresAt = (user: (typeof userRows)[number]) =>
    accountStatus(user) === 'invited' && user.authLink?.purpose === 'invitation'
      ? user.authLink.expiresAt
      : null;
  return {
    users: userRows.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      institutionId: user.institutionId,
      active: user.active,
      status: accountStatus(user),
      invitationExpiresAt: invitationExpiresAt(user),
      assignedInstitutionIds: current
        .filter((assignment) => assignment.officerId === user.id)
        .map((assignment) => assignment.institutionId),
    })),
    institutions: institutionRows.map((institution) => {
      const supervisorOf = (institutionId: string) => {
        const id = supervised.find(
          (row) => row.institutionId === institutionId,
        )?.supervisorId;
        const person = userRows.find((user) => user.id === id);
        return person ? { id: person.id, name: person.displayName } : null;
      };
      const officerId = current.find(
        (assignment) => assignment.institutionId === institution.id,
      )?.officerId;
      const officer = userRows.find((user) => user.id === officerId);
      return {
        id: institution.id,
        name: institution.name,
        typeId: institution.typeId,
        type: institution.type,
        active: institution.active,
        accountingOfficer: institution.accountingOfficer,
        focalPersons: userRows
          .filter(
            (user) =>
              user.role === 'institution' &&
              user.institutionId === institution.id,
          )
          .map((user) => ({
            id: user.id,
            displayName: user.displayName,
            email: user.email,
            jobTitle: user.jobTitle,
            active: user.active,
            status: accountStatus(user),
            invitationExpiresAt: invitationExpiresAt(user),
          })),
        officer: officer ? { id: officer.id, name: officer.displayName } : null,
        supervisor: supervisorOf(institution.id),
      };
    }),
    institutionTypes: typeRows.map(({ position, ...type }) => ({
      ...type,
      institutionCount: institutionRows.filter(
        (institution) => institution.typeId === type.id,
      ).length,
    })),
  };
}

/**
 * After a schedule change, reminders already in the past are marked processed so a new
 * reminder time never fires retroactively.
 */
async function skipPastBoundaries(tx: Tx) {
  const [{ state, cycle: row }, cycle] = await Promise.all([
    currentState(tx),
    loadCycle(tx),
  ]);
  const now = Date.parse(state.businessTime);
  const past = boundaries(cycle, {
    daysBefore: row.reminderDaysBefore,
    overdueNotice: row.overdueNotice,
  }).filter(
    (boundary) =>
      boundary.kind === 'reminder' && Date.parse(boundary.at) <= now,
  );
  if (past.length)
    await tx
      .insert(processedEvents)
      .values(
        past.map((boundary) => ({
          runId: state.runId,
          eventId: `${state.runId}:${boundary.id}`,
        })),
      )
      .onConflictDoNothing();
}

function uniqueName(profiles: Profile[], base: string) {
  const taken = new Set(profiles.map((profile) => profile.name));
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${base} copy` : `${base} copy ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** An active focal person who is the only one for their institution. */
async function isLastFocalPerson(tx: Tx, user: User) {
  if (
    user.role !== 'institution' ||
    !user.institutionId ||
    accountStatus(user) !== 'active'
  )
    return false;
  const colleagues = await tx
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, 'institution'),
        eq(users.institutionId, user.institutionId),
      ),
    );
  return (
    colleagues.filter((person) => accountStatus(person) === 'active').length ===
    1
  );
}

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
    private readonly sessions: Sessions,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /* Scoring profiles: administrators manage them; supervisors and officers read the rules in use. */

  @Get('profiles')
  @Roles('administrator', 'supervisor', 'officer')
  profiles() {
    return profilesState(this.db);
  }

  @Post('profiles')
  @Roles('administrator')
  createProfile(
    @CurrentUser() user: User,
    @Body() body: { basedOn?: unknown } | undefined,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const source = await findProfile(tx, body?.basedOn);
      const profiles = await loadProfiles(tx);
      const [created] = await tx
        .insert(scoringProfiles)
        .values({
          ...source,
          position: undefined,
          id: await nextId(tx, 'profile'),
          name: uniqueName(
            profiles,
            source.name.replace(/ \(reference\)$/, ''),
          ),
          version: 1,
          status: 'draft',
          basedOn: source.id,
          createdAt: businessTime,
          createdBy: user.displayName,
          approvedAt: null,
          approvedBy: null,
        })
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.create',
        { type: 'scoring_profile', id: created!.id, version: 1 },
        `Draft copied from ${source.name}`,
      );
      return toProfile(created!, [...profiles, created!]);
    });
  }

  @Put('profiles/:profileId')
  @Roles('administrator')
  updateProfile(
    @CurrentUser() user: User,
    @Param('profileId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await findProfile(tx, id);
      if (profile.status !== 'draft')
        throw new ApiError(
          409,
          'Only a draft profile can be edited. Copy it to make changes.',
          'profile_immutable',
        );
      const update = parse(profileUpdateSchema, body);
      const [updated] = await tx
        .update(scoringProfiles)
        .set(update)
        .where(eq(scoringProfiles.id, id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.update',
        { type: 'scoring_profile', id, version: profile.version },
        `Draft ${update.name} edited`,
      );
      return toProfile(updated!, await loadProfiles(tx));
    });
  }

  @Delete('profiles/:profileId')
  @Roles('administrator')
  deleteProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await findProfile(tx, id);
      if (profile.status !== 'draft')
        throw new ApiError(
          409,
          'Approved and reference profiles are kept for the record.',
          'profile_immutable',
        );
      await tx.delete(scoringProfiles).where(eq(scoringProfiles.id, id));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.delete',
        { type: 'scoring_profile', id, version: profile.version },
        `Draft ${profile.name} deleted`,
      );
      return profilesState(tx);
    });
  }

  @Post('profiles/:profileId/approve')
  @HttpCode(200)
  @Roles('administrator')
  approveProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await findProfile(tx, id);
      if (profile.status !== 'draft')
        throw new ApiError(
          409,
          'Only a draft profile can be approved.',
          'profile_immutable',
        );
      const issues = profileIssues(profile, await loadProfiles(tx));
      if (issues.length)
        throw new ApiError(
          422,
          'The profile cannot be approved yet. Fix the listed issues and try again.',
          'profile_invalid',
          Object.fromEntries(
            issues.map((issue) => [issue.path, issue.message]),
          ),
        );
      const [approved] = await tx
        .update(scoringProfiles)
        .set({
          status: 'approved',
          approvedAt: businessTime,
          approvedBy: user.displayName,
        })
        .where(eq(scoringProfiles.id, id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.approve',
        { type: 'scoring_profile', id, version: profile.version },
        `${profile.name} approved; it can no longer be edited`,
      );
      return toProfile(approved!, await loadProfiles(tx));
    });
  }

  @Post('profiles/:profileId/apply')
  @HttpCode(200)
  @Roles('administrator')
  applyProfile(@CurrentUser() user: User, @Param('profileId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await findProfile(tx, id);
      if (profile.status !== 'approved')
        throw new ApiError(
          409,
          'Only an approved profile can be applied to the cycle.',
          'profile_not_approved',
        );
      const locked = profileLockReason(await loadForms(tx));
      if (locked) throw new ApiError(409, locked, 'profile_locked');
      const { cycle } = await currentState(tx);
      await tx
        .update(cycles)
        .set({ profileId: profile.id })
        .where(eq(cycles.id, cycle.id));
      // Draft form versions show the profile's weights as a read-only snapshot.
      await tx
        .update(formVersions)
        .set({ weights: profile.weights })
        .where(eq(formVersions.status, 'draft'));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.apply',
        { type: 'cycle', id: cycle.id },
        `${profile.name} applied to ${cycle.label}`,
      );
      return profilesState(tx);
    });
  }

  /* Reporting calendar (FR02) */

  @Get('calendar')
  @Roles('administrator')
  calendar() {
    return calendar(this.db);
  }

  @Put('calendar')
  @Roles('administrator')
  updateCalendar(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const update = parse(calendarUpdateSchema, body);
      const current = await calendar(tx);
      const errors: Record<string, string> = {};
      const changes: string[] = [];
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
        errors['dayCounting.holidays'] =
          'Each holiday date can be listed once.';
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
      const q4 = current.periods[3]!;
      if (update.evaluationCutoffDate <= (deadlines[q4.id] ?? q4.deadlineDate))
        errors.evaluationCutoffDate =
          'The evaluation cutoff must fall after the Q4 deadline.';
      if (
        JSON.stringify(update.reminders) !== JSON.stringify(current.reminders)
      )
        changes.push(
          `Reminders ${current.reminders.daysBefore.join(', ') || 'none'} → ${update.reminders.daysBefore.join(', ') || 'none'} days before; overdue notice ${update.reminders.overdueNotice ? 'on' : 'off'}`,
        );
      if (Object.keys(errors).length)
        throw new ApiError(
          422,
          'Some calendar values cannot be saved.',
          'calendar_invalid',
          errors,
        );
      if (!changes.length)
        throw new ApiError(422, 'Nothing has changed.', 'no_change');

      for (const period of current.periods) {
        const next = deadlines[period.id];
        if (next)
          await tx
            .update(periods)
            .set({ submissionDeadline: endOfDay(next) })
            .where(eq(periods.id, period.id));
      }
      await tx
        .update(cycles)
        .set({
          foundationDeadline: endOfDay(update.foundationDeadlineDate),
          evaluationCutoff: endOfDay(update.evaluationCutoffDate),
          reminderDaysBefore: [...update.reminders.daysBefore].sort(
            (a, b) => b - a,
          ),
          overdueNotice: update.reminders.overdueNotice,
          dayCounting: counting,
        })
        .where(eq(cycles.id, current.cycleId));
      await skipPastBoundaries(tx);
      const summary = changes.join('; ');
      const [change] = await tx
        .insert(calendarChanges)
        .values({
          at: businessTime,
          by: user.displayName,
          summary,
          reason: update.reason,
        })
        .returning({ id: calendarChanges.id });
      await this.events.audit(
        tx,
        businessTime,
        user,
        'calendar.update',
        { type: 'cycle', id: current.cycleId },
        `${summary}. Reason: ${update.reason}`,
      );
      if (changes.some((line) => line.includes('deadline')))
        await this.events.notify(
          tx,
          businessTime,
          `calendar:${change!.id}`,
          'calendar.changed',
          [
            ...(await usersWithRole(tx, 'institution')),
            ...(await usersWithRole(tx, 'officer')),
          ],
          {
            title: 'A reporting deadline has changed',
            body: `${summary}. Reason: ${update.reason}`,
            link: (recipient) =>
              recipient.role === 'institution' ? '/institution' : '/officer',
          },
        );
      return calendar(tx);
    });
  }

  /* Users and institutions (FR01) */

  @Get('people')
  @Roles('administrator')
  people() {
    return people(this.db);
  }

  @Post('users')
  @Roles('administrator')
  createUser(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(userCreateSchema, body);
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`);
      if (taken)
        throw new ApiError(
          422,
          'Some values need attention.',
          'invalid_settings',
          {
            email: 'Another account already uses this address.',
          },
        );
      if (input.institutionId) {
        const [institution] = await tx
          .select({ id: institutions.id })
          .from(institutions)
          .where(eq(institutions.id, input.institutionId));
        if (!institution) throw notFound();
      }
      const [user] = await tx
        .insert(users)
        .values({
          id: await nextId(tx, 'user'),
          displayName: input.displayName,
          email: input.email,
          role: input.role,
          jobTitle: input.jobTitle,
          institutionId: input.institutionId,
          active: true,
          // The person sets their own password from the invitation email.
          passwordHash: null,
        })
        .returning();
      await sendInvitation(
        tx,
        businessTime,
        this.config.PORTAL_URL,
        user!,
        admin,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.create',
        { type: 'user', id: user!.id },
        `${user!.displayName} (${user!.role}${user!.institutionId ? `, ${user!.institutionId}` : ''})`,
      );
      return people(tx);
    });
  }

  /** A new invitation link replaces the earlier one (e.g. it expired or the email was lost). */
  @Post('users/:userId/invitation')
  @HttpCode(200)
  @Roles('administrator')
  resendInvitation(@CurrentUser() admin: User, @Param('userId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const [user] = await tx.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound();
      if (accountStatus(user) !== 'invited')
        throw new ApiError(
          409,
          user.active
            ? 'This person has already set a password.'
            : 'Reactivate the account before inviting again.',
          'not_invited',
        );
      await sendInvitation(
        tx,
        businessTime,
        this.config.PORTAL_URL,
        user,
        admin,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.invite',
        { type: 'user', id: user.id },
        `Invitation sent again to ${user.email}`,
      );
      return people(tx);
    });
  }

  @Put('users/:userId')
  @Roles('administrator')
  updateUser(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(userUpdateSchema, body);
      const [user] = await tx.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound();
      await tx
        .update(users)
        .set({ displayName: input.displayName, jobTitle: input.jobTitle })
        .where(eq(users.id, id));
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.update',
        { type: 'user', id },
        user.displayName === input.displayName
          ? 'Job title updated'
          : `Renamed from ${user.displayName}`,
      );
      return people(tx);
    });
  }

  /**
   * Changes an account's role, keeping one identity and its history. Scope must be handed over
   * first; the person's sessions end so the new permissions apply at the next sign-in.
   */
  @Put('users/:userId/role')
  @Roles('administrator')
  async changeRole(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    await write(this.db, async (tx, businessTime) => {
      const parsed = userRoleChangeSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose a role and give a reason of at least 10 characters.',
          'invalid_request',
        );
      const [user] = await tx.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound();
      const { role, institutionId, reason } = parsed.data;
      if (user.id === admin.id)
        throw new ApiError(
          409,
          'You cannot change your own role.',
          'self_role_change',
        );
      if (
        user.role === role &&
        (role !== 'institution' || user.institutionId === institutionId)
      )
        throw new ApiError(409, 'That is already their role.', 'no_change');
      if (role === 'institution') {
        const [institution] = institutionId
          ? await tx
              .select({ id: institutions.id })
              .from(institutions)
              .where(eq(institutions.id, institutionId))
          : [];
        if (!institution)
          throw new ApiError(
            422,
            'Choose the institution they will report for.',
            'invalid_request',
            { institutionId: 'Choose the institution they will report for.' },
          );
      }
      const listed = (ids: string[]) =>
        ids.length > 4 ? `${ids.length} institutions` : ids.join(', ');
      const assigned = await assignedInstitutionIds(tx, user.id);
      if (user.role === 'officer' && assigned.length)
        throw new ApiError(
          409,
          `Reassign ${listed(assigned)} before changing ${user.displayName}’s role.`,
          'officer_has_assignments',
        );
      const supervised = await supervisedInstitutionIds(tx, user.id);
      if (user.role === 'supervisor' && supervised.length)
        throw new ApiError(
          409,
          `Assign another supervisor to ${listed(supervised)} before changing ${user.displayName}’s role.`,
          'supervisor_has_institutions',
        );
      for (const guarded of ['administrator', 'supervisor'] as const)
        if (
          user.role === guarded &&
          user.active &&
          (await usersWithRole(tx, guarded)).length === 1
        )
          throw new ApiError(
            409,
            `At least one ${guarded} must stay active.`,
            `last_${guarded}`,
          );
      if (await isLastFocalPerson(tx, user))
        throw new ApiError(
          409,
          `${user.displayName} is the only active focal person for ${user.institutionId}. Set up another before changing their role.`,
          'last_focal_person',
        );
      await tx
        .update(users)
        .set({
          role,
          institutionId: role === 'institution' ? institutionId : null,
        })
        .where(eq(users.id, id));
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.role_change',
        { type: 'user', id },
        `${user.displayName}: ${user.role} → ${role}${role === 'institution' ? ` (${institutionId})` : ''}. ${reason}`,
      );
    });
    // New permissions apply from the next sign-in.
    await this.sessions.endAllFor(id);
    return { ok: true };
  }

  @Post('users/:userId/status')
  @HttpCode(200)
  @Roles('administrator')
  userStatus(
    @CurrentUser() admin: User,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(userStatusSchema, body);
      const [user] = await tx.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound();
      if (user.id === admin.id)
        throw new ApiError(
          409,
          'You cannot deactivate your own account.',
          'self_deactivation',
        );
      if (!input.active) {
        const assigned = await tx
          .select({ institutionId: assignments.institutionId })
          .from(assignments)
          .where(
            and(
              eq(assignments.officerId, user.id),
              isNull(assignments.validTo),
            ),
          );
        if (assigned.length)
          throw new ApiError(
            409,
            `Reassign ${assigned.map((item) => item.institutionId).join(', ')} before deactivating ${user.displayName}.`,
            'officer_has_assignments',
          );
        if (
          user.role === 'administrator' &&
          (await usersWithRole(tx, 'administrator')).length === 1
        )
          throw new ApiError(
            409,
            'At least one administrator must stay active.',
            'last_administrator',
          );
        // Deactivating an institution's last active focal person is allowed (someone who leaves
        // may need locking out at once) but must be confirmed: nobody can then report.
        if (!input.confirmNoFocalPerson && (await isLastFocalPerson(tx, user)))
          throw new ApiError(
            409,
            `${user.displayName} is the only active focal person for ${user.institutionId}. Afterwards nobody can report for it or receive its clarifications until someone else is set up.`,
            'last_focal_person',
          );
        // Oversight must not silently lapse: move a supervisor's institutions first.
        const supervised = await supervisedInstitutionIds(tx, user.id);
        if (user.role === 'supervisor' && supervised.length)
          throw new ApiError(
            409,
            `Assign another supervisor to ${supervised.length > 4 ? `${supervised.length} institutions` : supervised.join(', ')} before deactivating ${user.displayName}.`,
            'supervisor_has_institutions',
          );
        if (
          user.role === 'supervisor' &&
          (await usersWithRole(tx, 'supervisor')).length === 1
        )
          throw new ApiError(
            409,
            'At least one supervisor must stay active.',
            'last_supervisor',
          );
      }
      await tx
        .update(users)
        .set({ active: input.active })
        .where(eq(users.id, id));
      await this.events.audit(
        tx,
        businessTime,
        admin,
        input.active ? 'user.reactivate' : 'user.deactivate',
        { type: 'user', id: user.id },
        `${user.displayName}: ${input.reason}`,
      );
      return people(tx);
    });
  }

  @Put('institutions/:institutionId')
  @Roles('administrator')
  updateInstitution(
    @CurrentUser() admin: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(institutionUpdateSchema, body);
      const [institution] = await tx
        .select()
        .from(institutions)
        .where(eq(institutions.id, id));
      if (!institution) throw notFound();
      const [type] = await tx
        .select()
        .from(institutionTypes)
        .where(eq(institutionTypes.id, input.typeId));
      // A retired type may stay on an institution that already has it, but is not newly chosen.
      if (!type || (!type.active && type.id !== institution.typeId))
        throw new ApiError(
          422,
          'Choose an active institution type.',
          'invalid_settings',
          { typeId: 'Choose an active institution type.' },
        );
      const problems = accountingOfficerProblems(input.accountingOfficer);
      if (problems.length)
        throw new ApiError(422, problems.join(' '), 'invalid_settings');
      const renamed = institution.name !== input.name;
      const changed = [
        renamed && `renamed from ${institution.name}`,
        institution.typeId !== type.id &&
          `type ${institution.type} → ${type.label}`,
        JSON.stringify(institution.accountingOfficer) !==
          JSON.stringify(input.accountingOfficer) &&
          'Accounting Officer contact updated',
      ].filter(Boolean);
      await tx
        .update(institutions)
        .set({
          name: input.name,
          typeId: type.id,
          type: type.label,
          accountingOfficer: {
            ...input.accountingOfficer,
            email: input.accountingOfficer.email.toLowerCase(),
          },
        })
        .where(eq(institutions.id, id));
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution.update',
        { type: 'institution', id },
        changed.length
          ? `${changed.join('; ')}; the stable ID ${id} is unchanged`
          : 'No changes',
      );
      if (renamed)
        await this.events.notify(
          tx,
          businessTime,
          await nextId(tx, `${id}:renamed`),
          'institution.renamed',
          [
            ...(await institutionUsers(tx, id)),
            ...(await assignedOfficers(tx, id)),
          ],
          {
            title: `${id} is now ${input.name}`,
            body: 'The display name changed; reports, receipts and results keep the same institution ID.',
            link: null,
          },
        );
      return people(tx);
    });
  }

  /* Institution types: a managed list; retiring keeps history, renaming updates labels. */

  @Post('institution-types')
  @Roles('administrator')
  createType(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(institutionTypeUpdateSchema, body);
      const types = await tx.select().from(institutionTypes);
      if (typeLabelTaken(types, input.label))
        throw new ApiError(
          422,
          'That type already exists.',
          'invalid_settings',
          { label: 'That type already exists.' },
        );
      const slug = input.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const id = types.some((type) => type.id === slug)
        ? await nextId(tx, slug)
        : slug;
      await tx
        .insert(institutionTypes)
        .values({ id, label: input.label, active: input.active });
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution_type.create',
        { type: 'institution_type', id },
        input.label,
      );
      return people(tx);
    });
  }

  @Put('institution-types/:typeId')
  @Roles('administrator')
  updateType(
    @CurrentUser() admin: User,
    @Param('typeId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(institutionTypeUpdateSchema, body);
      const types = await tx.select().from(institutionTypes);
      const type = types.find((item) => item.id === id);
      if (!type) throw notFound();
      if (typeLabelTaken(types, input.label, type.id))
        throw new ApiError(
          422,
          'That type already exists.',
          'invalid_settings',
          { label: 'That type already exists.' },
        );
      if (
        !input.active &&
        types.filter((item) => item.active && item.id !== type.id).length === 0
      )
        throw new ApiError(
          409,
          'At least one type must stay active.',
          'last_type',
        );
      const changes = [
        type.label !== input.label && `renamed from ${type.label}`,
        type.active !== input.active &&
          (input.active ? 'reactivated' : 'retired'),
      ].filter(Boolean);
      await tx
        .update(institutionTypes)
        .set({ label: input.label, active: input.active })
        .where(eq(institutionTypes.id, id));
      // Institutions show the current label; their type ID never changes.
      await tx
        .update(institutions)
        .set({ type: input.label })
        .where(eq(institutions.typeId, id));
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution_type.update',
        { type: 'institution_type', id },
        `${input.label}: ${changes.join(', ') || 'no changes'}`,
      );
      return people(tx);
    });
  }

  /* Onboarding institutions (FR01) */

  @Post('institutions')
  @Roles('administrator')
  createInstitution(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(institutionCreateSchema, body);
      const snapshot = await directorySnapshot(tx);
      const candidate = fromCreateRequest(snapshot, input);
      const problems = institutionProblems(snapshot, candidate);
      if (problems.length)
        throw new ApiError(422, problems.join(' '), 'invalid_institution');
      await createInstitution(
        tx,
        businessTime,
        this.config.PORTAL_URL,
        admin,
        snapshot,
        { ...candidate, officer: candidate.officer! },
        input.seedOpenedQuarters,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution.create',
        { type: 'institution', id: candidate.id },
        `${candidate.name}, reviewed by ${candidate.officer!.displayName}; Accounting Officer ${candidate.accountingOfficer.name}`,
      );
      await this.notifyOfficers(tx, businessTime, [candidate]);
      return people(tx);
    });
  }

  @Post('institutions/import/preview')
  @HttpCode(200)
  @Roles('administrator')
  async previewImport(@Body() body: unknown) {
    const input = parse(institutionImportRequestSchema, body);
    return previewImport(await directorySnapshot(this.db), input.csv).preview;
  }

  /** All or nothing: one invalid row means nothing is created, so a file can be fixed and re-run. */
  @Post('institutions/import')
  @HttpCode(200)
  @Roles('administrator')
  importInstitutions(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const input = parse(institutionImportRequestSchema, body);
      const snapshot = await directorySnapshot(tx);
      const { preview, rows } = previewImport(snapshot, input.csv);
      if (preview.fileErrors.length || preview.invalid)
        throw new ApiError(
          422,
          preview.fileErrors[0] ??
            `${preview.invalid} ${preview.invalid === 1 ? 'row needs' : 'rows need'} attention; nothing was imported.`,
          'import_invalid',
        );
      for (const row of rows)
        await createInstitution(
          tx,
          businessTime,
          this.config.PORTAL_URL,
          admin,
          snapshot,
          { ...row, officer: row.officer! },
          input.seedOpenedQuarters,
        );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution.import',
        { type: 'institution', id: `${rows[0]!.id}…${rows.at(-1)!.id}` },
        `${rows.length} institutions imported`,
      );
      await this.notifyOfficers(tx, businessTime, rows);
      return {
        created: rows.map((row) => row.id),
        focalUsers: rows.filter((row) => row.focalUser).length,
      };
    });
  }

  /** One notice per officer for everything assigned to them in this change. */
  private async notifyOfficers(
    tx: Tx,
    businessTime: string,
    rows: NewInstitution[],
  ) {
    const byOfficer = new Map<string, NewInstitution[]>();
    for (const row of rows)
      byOfficer.set(row.officer!.id, [
        ...(byOfficer.get(row.officer!.id) ?? []),
        row,
      ]);
    for (const assigned of byOfficer.values())
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `onboard:${assigned[0]!.officer!.id}`),
        'assignment.changed',
        [assigned[0]!.officer!],
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
