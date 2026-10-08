import { Inject, Injectable } from '@nestjs/common';
import {
  buildYear,
  proposeYear,
  summarizeYearChange,
  yearDate,
  yearEnd,
  yearInput,
  yearIssues,
  type FinancialYear,
  type FinancialYearCreate,
  type FinancialYearInput,
  type FinancialYears,
  type FinancialYearUpdate,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { DB, write, type Database, type Db, type Tx } from '../database/db';
import { currentState, loadCycle, loadProfiles } from '../database/state';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { YearsRepository } from './years.repository';

const invalidYear = (issues: Record<string, string>) =>
  new ApiError(422, 'Check the highlighted dates.', 'invalid_year', issues);

/**
 * Financial years (HP2-100, PRD §7.1, FR02): the active year, and the next one planned ahead.
 * A planned year is stored apart from the active cycle, so planning never changes the active
 * year's deadlines, reports or scores.
 */
@Injectable()
export class YearsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: YearsRepository,
    private readonly events: Events,
  ) {}

  list(): Promise<FinancialYears> {
    return this.state(this.db);
  }

  private async state(db: Db): Promise<FinancialYears> {
    const [{ cycle: row }, cycle, profiles, planned, changes] =
      await Promise.all([
        currentState(db),
        loadCycle(db),
        loadProfiles(db),
        this.repository.planned(db),
        this.repository.changes(db),
      ]);
    const profileName = (id: string) =>
      profiles.find((profile) => profile.id === id)?.name ?? id;
    const active: FinancialYear = {
      id: cycle.id,
      label: cycle.label,
      status: 'active',
      timezone: cycle.timezone,
      startsOn: cycle.periods[0]!.startsOn,
      endsOn: cycle.periods[3]!.endsOn,
      foundationDeadline: cycle.foundationDeadline,
      evaluationCutoff: cycle.evaluationCutoff,
      profileId: row.profileId,
      profileName: profileName(row.profileId),
      periods: cycle.periods,
      revision: 0,
      plannedBy: null,
      plannedAt: null,
    };
    const upcoming = planned.map((year): FinancialYear => ({
      id: year.id,
      label: year.label,
      status: 'planned',
      timezone: cycle.timezone,
      startsOn: year.startsOn,
      endsOn: yearEnd(year.startsOn),
      foundationDeadline: year.foundationDeadline,
      evaluationCutoff: year.evaluationCutoff,
      profileId: year.profileId,
      profileName: profileName(year.profileId),
      periods: year.periods,
      revision: year.revision,
      plannedBy: year.plannedBy,
      plannedAt: year.plannedAt,
    }));
    const approved = profiles.filter(
      (profile) => profile.status === 'approved',
    );
    const proposedProfile = approved.some(
      (profile) => profile.id === row.profileId,
    )
      ? row.profileId
      : (approved[0]?.id ?? row.profileId);
    return {
      years: [active, ...upcoming].sort((a, b) =>
        a.startsOn.localeCompare(b.startsOn),
      ),
      proposal: upcoming.length
        ? null
        : proposeYear(cycle, cycle.dayCounting, proposedProfile),
      profiles: approved.map(({ id, name }) => ({ id, name })),
      changes,
    };
  }

  /** Refuses a year that overlaps, precedes the active one, or has dates out of order. */
  private async check(tx: Tx, input: FinancialYearInput, self?: string) {
    const state = await this.state(tx);
    const issues = yearIssues(
      input,
      state.years,
      state.profiles.map((profile) => profile.id),
      self,
    );
    if (Object.keys(issues).length) throw invalidYear(issues);
    return state;
  }

  plan(user: User, input: FinancialYearCreate): Promise<FinancialYears> {
    return write(this.db, async (tx, businessTime) => {
      await this.check(tx, input);
      const year = buildYear(input);
      await this.repository.insert(
        {
          id: year.id,
          label: year.label,
          startsOn: year.startsOn,
          foundationDeadline: year.foundationDeadline,
          evaluationCutoff: year.evaluationCutoff,
          profileId: year.profileId,
          periods: year.periods,
          revision: 0,
          plannedAt: businessTime,
          plannedBy: user.displayName,
        },
        tx,
      );
      await this.record(
        tx,
        user,
        businessTime,
        'financial_year.plan',
        year.id,
        `Planned ${year.label}: ${yearDate(year.startsOn)} to ${yearDate(year.endsOn)}`,
        input.reason,
      );
      return this.state(tx);
    });
  }

  update(
    user: User,
    id: string,
    input: FinancialYearUpdate,
  ): Promise<FinancialYears> {
    return write(this.db, async (tx, businessTime) => {
      const current = await this.repository.plannedYear(id, tx);
      if (!current) throw notFound();
      if (current.revision !== input.baseRevision)
        throw new ApiError(
          409,
          'Someone changed this year after you opened it. Reload it to see their changes.',
          'version_conflict',
        );
      const state = await this.check(tx, input, id);
      const name = (profileId: string) =>
        state.profiles.find((profile) => profile.id === profileId)?.name ??
        profileId;
      const changes = summarizeYearChange(yearInput(current), input, name);
      if (changes.length === 0) return state;
      const year = buildYear(input);
      // The identifier follows the start date, so a moved year may be stored under a new one.
      await this.repository.remove(id, tx);
      await this.repository.insert(
        {
          id: year.id,
          label: year.label,
          startsOn: year.startsOn,
          foundationDeadline: year.foundationDeadline,
          evaluationCutoff: year.evaluationCutoff,
          profileId: year.profileId,
          periods: year.periods,
          revision: current.revision + 1,
          plannedAt: current.plannedAt,
          plannedBy: current.plannedBy,
        },
        tx,
      );
      await this.record(
        tx,
        user,
        businessTime,
        'financial_year.update',
        year.id,
        `${year.label}: ${changes.join('; ')}`,
        input.reason,
      );
      return this.state(tx);
    });
  }

  discard(user: User, id: string, reason: string): Promise<FinancialYears> {
    return write(this.db, async (tx, businessTime) => {
      const current = await this.repository.plannedYear(id, tx);
      if (!current) throw notFound();
      await this.repository.remove(id, tx);
      await this.record(
        tx,
        user,
        businessTime,
        'financial_year.discard',
        id,
        `Discarded the planned ${current.label}`,
        reason,
      );
      return this.state(tx);
    });
  }

  private async record(
    tx: Tx,
    user: User,
    businessTime: string,
    action: string,
    yearId: string,
    summary: string,
    reason: string,
  ) {
    await this.repository.insertChange(
      { at: businessTime, by: user.displayName, yearId, summary, reason },
      tx,
    );
    await this.events.audit(
      tx,
      businessTime,
      user,
      action,
      { type: 'financial_year', id: yearId },
      `${summary}. Reason: ${reason}`,
    );
  }
}
