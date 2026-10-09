import { Inject, Injectable } from '@nestjs/common';
import {
  buildYear,
  defaultReportIdentity,
  openingReadiness,
  proposeYear,
  summarizeYearChange,
  yearDate,
  yearEnd,
  yearInput,
  yearIssues,
  type ClosedYearResults,
  type FinancialYear,
  type FinancialYearCreate,
  type FinancialYearInput,
  type FinancialYearOpen,
  type FinancialYears,
  type FinancialYearUpdate,
  type PublishedResult,
} from '@cpi/contracts';
import { getTableName, sql } from 'drizzle-orm';
import { readableInstitutionIds } from '../auth/scope';
import type { User } from '../auth/sessions';
import { DB, write, type Database, type Db, type Tx } from '../database/db';
import * as schema from '../database/schema';
import { currentState, loadCycle, loadProfiles } from '../database/state';
import { Events, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { YearsRepository } from './years.repository';

const invalidYear = (issues: Record<string, string>) =>
  new ApiError(422, 'Check the highlighted dates.', 'invalid_year', issues);

/**
 * A year's working records, cleared when the next year opens: its calendar and form, reports,
 * reviews, plans, foundation documents and evidence. Institutions, people, assignments,
 * profiles, the report identity, notifications and the audit log carry over; published results
 * are archived first. Nothing outside this set refers to it, so PostgreSQL refuses the clear if
 * that ever stops being true.
 */
const yearTables = [
  schema.cycles,
  schema.periods,
  schema.formVersions,
  schema.calendarChanges,
  schema.obligations,
  schema.baselines,
  schema.drafts,
  schema.submissions,
  schema.receipts,
  schema.idempotencyKeys,
  schema.decisions,
  schema.clarifications,
  schema.reopenings,
  schema.closures,
  schema.oversightComments,
  schema.extensions,
  schema.corrections,
  schema.publications,
  schema.evidence,
  schema.evidenceFiles,
  schema.suitability,
  schema.foundationVersions,
  schema.foundationReviews,
  schema.risks,
  schema.activities,
  schema.plannedMilestones,
  schema.planApprovals,
  schema.amendments,
];

type ArchivedRow = typeof schema.archivedPublications.$inferSelect;

const toResult = (
  row: ArchivedRow,
  name: (id: string) => string,
): PublishedResult => ({
  id: row.id,
  institutionId: row.institutionId,
  institutionName: name(row.institutionId),
  version: row.version,
  batchId: row.batchId,
  publishedAt: row.publishedAt,
  publishedBy: row.publishedBy,
  status: row.supersededBy ? 'superseded' : 'current',
  supersededBy: row.supersededBy,
  correctionReason: row.correctionReason,
  profileName: row.profileName,
  simulation: true,
  identity: row.identity ?? defaultReportIdentity,
  evaluation: row.evaluation as PublishedResult['evaluation'],
});

/**
 * Financial years (HP2-100, PRD §7.1, FR02): the active year, the next one planned ahead, and
 * closed years. A planned year is stored apart from the active cycle, so planning never changes
 * the active year; opening it closes the active year and starts the new one.
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
    const [
      { cycle: row, state: system },
      cycle,
      profiles,
      planned,
      closed,
      changes,
      institutions,
      current,
    ] = await Promise.all([
      currentState(db),
      loadCycle(db),
      loadProfiles(db),
      this.repository.planned(db),
      this.repository.closed(db),
      this.repository.changes(db),
      this.repository.activeInstitutions(db),
      this.repository.currentPublications(db),
    ]);
    const profileName = (id: string) =>
      profiles.find((profile) => profile.id === id)?.name ?? id;
    const none = {
      opening: null,
      closedAt: null,
      closedBy: null,
      pending: [],
    };
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
      ...none,
    };
    const opening = openingReadiness(
      cycle,
      institutions,
      current.map((publication) => publication.institutionId),
      system.businessTime,
    );
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
      ...none,
      opening,
    }));
    const past = closed.map((year): FinancialYear => ({
      id: year.id,
      label: year.label,
      status: 'closed',
      timezone: year.timezone,
      startsOn: year.startsOn,
      endsOn: year.endsOn,
      foundationDeadline: year.foundationDeadline,
      evaluationCutoff: year.evaluationCutoff,
      profileId: year.profileId,
      profileName: year.profileName,
      periods: year.periods,
      revision: 0,
      plannedBy: null,
      plannedAt: null,
      opening: null,
      closedAt: year.closedAt,
      closedBy: year.closedBy,
      pending: year.pending,
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
      years: [...past, active, ...upcoming].sort((a, b) =>
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

  /**
   * Closes the active year and opens the planned one (HP2-100). The closed year keeps its
   * calendar and every published result; its working records are cleared. Institutions,
   * assignments, profiles, settings and the report identity carry over; each institution gets
   * the new year's four quarters, which report on the last published form until a new version
   * is published. Plans and foundation documents start afresh: nothing is assumed achieved again.
   */
  open(
    user: User,
    id: string,
    input: FinancialYearOpen,
  ): Promise<FinancialYears> {
    return write(this.db, async (tx, businessTime) => {
      const planned = await this.repository.plannedYear(id, tx);
      if (!planned) throw notFound();
      const state = await this.state(tx);
      const opening = state.years.find((year) => year.id === id)!.opening!;
      if (opening.blocker)
        throw new ApiError(409, opening.blocker, 'year_not_complete');
      if (opening.pending.length && !input.leavePending)
        throw new ApiError(
          422,
          'Confirm that the institutions without a published result stay pending.',
          'pending_not_confirmed',
          {
            leavePending:
              'Confirm that the institutions without a published result stay pending.',
          },
        );
      const active = state.years.find((year) => year.status === 'active')!;
      const [{ cycle: oldCycle }, forms, releases, institutions] =
        await Promise.all([
          currentState(tx),
          tx.select().from(schema.formVersions),
          this.repository.publications(tx),
          this.repository.activeInstitutions(tx),
        ]);

      // 1. Archive the closing year: its calendar and every published result.
      await this.repository.archive(
        {
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
          closedAt: businessTime,
          closedBy: user.displayName,
          pending: opening.pending,
        },
        releases.map((release) => ({ ...release, yearId: active.id })),
        tx,
      );

      // 2. Clear the closing year's working records.
      await tx.execute(
        sql.raw(
          `TRUNCATE ${yearTables.map((table) => `"${getTableName(table)}"`).join(', ')} RESTART IDENTITY`,
        ),
      );

      // 3. The new year, with the settings that carry over.
      const { id: _oldId, label: _oldLabel, ...settings } = oldCycle;
      await tx.insert(schema.cycles).values({
        ...settings,
        id: planned.id,
        label: planned.label,
        foundationDeadline: planned.foundationDeadline,
        evaluationCutoff: planned.evaluationCutoff,
        profileId: planned.profileId,
        openedAt: businessTime,
      });
      await tx
        .insert(schema.periods)
        .values(
          planned.periods.map((period) => ({ ...period, cycleId: planned.id })),
        );
      // The last published form carries over as the new year's first version.
      const form = forms
        .filter((candidate) => candidate.status === 'published')
        .sort((a, b) => b.version - a.version)[0];
      if (form)
        await tx.insert(schema.formVersions).values({
          ...form,
          id: `form-${planned.id.toLowerCase()}-v1`,
          cycleId: planned.id,
          version: 1,
          publishedAt: businessTime,
          periodIds: planned.periods.map((period) => period.id),
          basedOnVersion: null,
          changes: [],
          revision: 0,
          updatedAt: businessTime,
        });
      for (const institution of institutions)
        await tx.insert(schema.obligations).values(
          planned.periods.map((period) => ({
            id: `${institution.id}:${period.id}`,
            institutionId: institution.id,
            periodId: period.id,
            state: 'not_started' as const,
          })),
        );
      await this.repository.remove(planned.id, tx);

      const summary = `Opened ${planned.label} and closed ${active.label}${opening.pending.length ? `, with ${opening.pending.length} result${opening.pending.length === 1 ? '' : 's'} left pending` : ''}`;
      await this.record(
        tx,
        user,
        businessTime,
        'financial_year.open',
        planned.id,
        summary,
        input.reason,
      );
      const recipients = (
        await Promise.all(
          (['institution', 'officer', 'supervisor'] as const).map((role) =>
            usersWithRole(tx, role),
          ),
        )
      ).flat();
      await this.events.notify(
        tx,
        businessTime,
        `${planned.id}:opened`,
        'financial_year.opened',
        recipients,
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
      return this.state(tx);
    });
  }

  /** Closed years, for anyone looking back at earlier results. */
  async closed(): Promise<FinancialYear[]> {
    const state = await this.state(this.db);
    return state.years.filter((year) => year.status === 'closed');
  }

  /** A closed year's published results within the reader's scope (out of scope: not shown). */
  async closedResults(user: User, id: string): Promise<ClosedYearResults> {
    const year = (await this.closed()).find((candidate) => candidate.id === id);
    if (!year) throw notFound();
    const scope = await readableInstitutionIds(this.db, user);
    const [rows, names] = await Promise.all([
      this.repository.archivedPublications(id, scope, this.db),
      this.repository.institutionNames(this.db),
    ]);
    const name = (institutionId: string) =>
      names.find((institution) => institution.id === institutionId)?.name ??
      institutionId;
    return {
      year,
      results: rows.map((row) => toResult(row, name)),
      pending: year.pending.filter((item) =>
        scope.includes(item.institutionId),
      ),
    };
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
