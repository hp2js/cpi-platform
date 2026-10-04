import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  profileUpdateSchema,
  type calendarUpdateSchema,
  type riskScaleUpdateSchema,
  type CalendarSettings,
  type ProfilesState,
  type RiskScaleSettings,
  type ScoringProfile,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import {
  currentState,
  loadCycle,
  loadForms,
  loadProfiles,
} from '../database/state';
import { Events, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
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
import { SettingsRepository, type ProfileRow } from './settings.repository';

/** The settings screens' 422: one message, the validator's message per field. */
export const invalidSettings = (error: z.ZodError) =>
  new ApiError(
    422,
    'Some values need attention.',
    'invalid_settings',
    Object.fromEntries(
      error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    ),
  );

function toProfile(
  { position, ...profile }: ProfileRow,
  profiles: Profile[],
): ScoringProfile {
  return { ...profile, issues: profileIssues(profile, profiles) };
}

function uniqueName(profiles: Profile[], base: string) {
  const taken = new Set(profiles.map((profile) => profile.name));
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? `${base} copy` : `${base} copy ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Scoring profiles, the reporting calendar and the risk scale (PRD §7.1, FR02). Every change
 * is audited; values that would rewrite history (an opened period's deadline, a locked profile)
 * are refused.
 */
@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: SettingsRepository,
    private readonly events: Events,
  ) {}

  /* Scoring profiles: administrators manage them; supervisors and officers read the rules in use. */

  profiles(): Promise<ProfilesState> {
    return this.profilesState(this.db);
  }

  createProfile(user: User, basedOn: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const source = await this.findProfile(tx, basedOn);
      const profiles = await loadProfiles(tx);
      const created = await this.repository.insertProfile(
        {
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
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.create',
        { type: 'scoring_profile', id: created.id, version: 1 },
        `Draft copied from ${source.name}`,
      );
      return toProfile(created, [...profiles, created]);
    });
  }

  updateProfile(user: User, id: string, body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await this.findProfile(tx, id);
      if (profile.status !== 'draft')
        throw new ApiError(
          409,
          'Only a draft profile can be edited. Copy it to make changes.',
          'profile_immutable',
        );
      const parsed = profileUpdateSchema.safeParse(body);
      if (!parsed.success) throw invalidSettings(parsed.error);
      const update = parsed.data;
      const updated = await this.repository.updateProfile(id, update, tx);
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

  deleteProfile(user: User, id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await this.findProfile(tx, id);
      if (profile.status !== 'draft')
        throw new ApiError(
          409,
          'Approved and reference profiles are kept for the record.',
          'profile_immutable',
        );
      await this.repository.deleteProfile(id, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.delete',
        { type: 'scoring_profile', id, version: profile.version },
        `Draft ${profile.name} deleted`,
      );
      return this.profilesState(tx);
    });
  }

  approveProfile(user: User, id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await this.findProfile(tx, id);
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
      const approved = await this.repository.updateProfile(
        id,
        {
          status: 'approved',
          approvedAt: businessTime,
          approvedBy: user.displayName,
        },
        tx,
      );
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

  applyProfile(user: User, id: string) {
    return write(this.db, async (tx, businessTime) => {
      const profile = await this.findProfile(tx, id);
      if (profile.status !== 'approved')
        throw new ApiError(
          409,
          'Only an approved profile can be applied to the cycle.',
          'profile_not_approved',
        );
      const locked = profileLockReason(await loadForms(tx));
      if (locked) throw new ApiError(409, locked, 'profile_locked');
      const { cycle } = await currentState(tx);
      await this.repository.applyProfile(cycle.id, profile, tx);
      await this.events.audit(
        tx,
        businessTime,
        user,
        'profile.apply',
        { type: 'cycle', id: cycle.id },
        `${profile.name} applied to ${cycle.label}`,
      );
      return this.profilesState(tx);
    });
  }

  riskScale(): Promise<RiskScaleSettings> {
    return this.riskScaleSettings(this.db);
  }

  updateRiskScale(
    user: User,
    update: z.infer<typeof riskScaleUpdateSchema>,
  ): Promise<RiskScaleSettings> {
    return write(this.db, async (tx, businessTime) => {
      const { cycle } = await currentState(tx);
      const current = cycle.riskScale;
      // Labels only: existing ratings keep their numbers, and severity stays their product.
      const scale = {
        probability: update.probability.map((label) => label.trim()),
        impact: update.impact.map((label) => label.trim()),
        source: update.source.trim(),
      };
      const errors: Record<string, string> = {};
      const changes: string[] = [];
      for (const axis of ['probability', 'impact'] as const) {
        if (
          new Set(scale[axis].map((label) => label.toLowerCase())).size !==
          scale[axis].length
        )
          errors[axis] = 'Give each point of the scale its own label.';
        if (JSON.stringify(scale[axis]) !== JSON.stringify(current[axis]))
          changes.push(
            `${axis === 'probability' ? 'Probability' : 'Impact'} labels → ${scale[axis].map((label, index) => `${index + 1} ${label}`).join(', ')}`,
          );
      }
      if (scale.source !== current.source)
        changes.push(`Source → ${scale.source}`);
      if (Object.keys(errors).length)
        throw new ApiError(
          422,
          'Some labels need attention.',
          'risk_scale_invalid',
          errors,
        );
      if (!changes.length)
        throw new ApiError(422, 'Nothing has changed.', 'no_change');
      await this.repository.updateCycle(cycle.id, { riskScale: scale }, tx);
      const summary = changes.join('; ');
      await this.repository.insertRiskScaleChange(
        {
          at: businessTime,
          by: user.displayName,
          summary,
          reason: update.reason,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        user,
        'settings.risk_scale',
        { type: 'cycle', id: cycle.id },
        `${summary}. Reason: ${update.reason}`,
      );
      return this.riskScaleSettings(tx);
    });
  }

  updateCalendar(
    user: User,
    update: z.infer<typeof calendarUpdateSchema>,
  ): Promise<CalendarSettings> {
    return write(this.db, async (tx, businessTime) => {
      const current = await this.calendar(tx);
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
      if (before.reviewTargetDays !== counting.reviewTargetDays)
        changes.push(
          `Officer review target ${before.reviewTargetDays} → ${counting.reviewTargetDays} days`,
        );
      if (before.proposalLeadDays !== counting.proposalLeadDays)
        changes.push(
          `Baseline proposals due ${before.proposalLeadDays} → ${counting.proposalLeadDays} days before each quarter`,
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
          await this.repository.setPeriodDeadline(
            period.id,
            endOfDay(next),
            tx,
          );
      }
      await this.repository.updateCycle(
        current.cycleId,
        {
          foundationDeadline: endOfDay(update.foundationDeadlineDate),
          evaluationCutoff: endOfDay(update.evaluationCutoffDate),
          reminderDaysBefore: [...update.reminders.daysBefore].sort(
            (a, b) => b - a,
          ),
          overdueNotice: update.reminders.overdueNotice,
          dayCounting: counting,
        },
        tx,
      );
      await this.skipPastBoundaries(tx);
      const summary = changes.join('; ');
      const changeId = await this.repository.insertCalendarChange(
        {
          at: businessTime,
          by: user.displayName,
          summary,
          reason: update.reason,
        },
        tx,
      );
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
          `calendar:${changeId}`,
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
      return this.calendar(tx);
    });
  }

  /** The cycle's declared 1–5 risk scale, with every change newest first. */
  private async riskScaleSettings(db: Db): Promise<RiskScaleSettings> {
    const [{ cycle }, changes] = await Promise.all([
      currentState(db),
      this.repository.riskScaleChanges(db),
    ]);
    return { riskScale: cycle.riskScale, changes };
  }

  private async findProfile(db: Db, id: unknown) {
    const profile =
      typeof id === 'string'
        ? await this.repository.profile(id, db)
        : undefined;
    if (!profile) throw notFound();
    return profile;
  }

  private async profilesState(db: Db): Promise<ProfilesState> {
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

  async calendar(db: Db = this.db): Promise<CalendarSettings> {
    const [{ state, cycle: row }, cycle, changes] = await Promise.all([
      currentState(db),
      loadCycle(db),
      this.repository.calendarChanges(db),
    ]);
    return calendarSettings(
      cycle,
      state.businessTime,
      { daysBefore: row.reminderDaysBefore, overdueNotice: row.overdueNotice },
      changes,
    );
  }

  /**
   * After a schedule change, reminders already in the past are marked processed so a new
   * reminder time never fires retroactively.
   */
  private async skipPastBoundaries(tx: Tx) {
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
      await this.repository.markProcessed(
        past.map((boundary) => ({
          runId: state.runId,
          eventId: `${state.runId}:${boundary.id}`,
        })),
        tx,
      );
  }
}
