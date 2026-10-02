import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  assignmentChangeRequestSchema,
  bulkAssignmentRequestSchema,
  bulkSupervisionRequestSchema,
  localDate,
  reassignmentSuggestionRequestSchema,
  suggestionDismissRequestSchema,
  supervisionChangeRequestSchema,
  type ReassignmentSuggestion,
  type Supervision,
} from '@cpi/contracts';
import {
  assignedInstitutionIds,
  readableInstitutionIds,
  supervisedInstitutionIds,
} from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write, type Db, type Tx } from '../database/db';
import {
  assignments,
  institutions,
  suggestions,
  supervisions,
  users,
} from '../database/schema';
import { Events, assignedSupervisors, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import {
  currentAssignment,
  reassignInstitution,
  toAssignments,
} from './assignments';

/*
 * Supervision, reassignment requests and bulk moves (PRD §5.2), ported from the mock API's
 * handlers/supervision.ts and handlers/admin.ts.
 */

type SuggestionRow = typeof suggestions.$inferSelect;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

async function activeUser(db: Db, id: string, role: User['role']) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, role), eq(users.active, true)));
  return user;
}

async function toSuggestions(
  db: Db,
  rows: SuggestionRow[],
): Promise<ReassignmentSuggestion[]> {
  const [people, places] = await Promise.all([
    db.select({ id: users.id, name: users.displayName }).from(users),
    db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions),
  ]);
  const nameOf = (id: string | null) =>
    id === null ? null : (people.find((row) => row.id === id)?.name ?? id);
  return rows.map(({ seq, suggestedById, resolvedById, ...rest }) => ({
    ...rest,
    institutionId:
      rest.institutionId as ReassignmentSuggestion['institutionId'],
    institutionName:
      places.find((row) => row.id === rest.institutionId)?.name ??
      rest.institutionId,
    currentOfficerName: nameOf(rest.currentOfficerId),
    suggestedOfficerName: nameOf(rest.suggestedOfficerId),
    suggestedBy: nameOf(suggestedById)!,
    resolvedBy: nameOf(resolvedById),
  }));
}

const requesterLink = (suggestion: SuggestionRow) =>
  suggestion.requestedByRole === 'officer'
    ? `/officer/institutions/${suggestion.institutionId}`
    : '/supervisor/assignments';

/** Marks an open suggestion for the institution applied; call inside `write()`. */
export async function applySuggestion(
  tx: Tx,
  events: Events,
  businessTime: string,
  input: {
    suggestionId: string;
    institutionId: string;
    resolvedById: string;
    note: string;
  },
) {
  const [suggestion] = await tx
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.id, input.suggestionId),
        eq(suggestions.institutionId, input.institutionId),
        eq(suggestions.status, 'open'),
      ),
    );
  if (!suggestion) return;
  await tx
    .update(suggestions)
    .set({
      status: 'applied',
      resolvedById: input.resolvedById,
      resolvedAt: businessTime,
      resolutionNote: input.note,
    })
    .where(eq(suggestions.id, suggestion.id));
  const [requester] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, suggestion.suggestedById), eq(users.active, true)));
  if (requester)
    await events.notify(
      tx,
      businessTime,
      `${suggestion.id}:applied`,
      'assignment.suggestion_resolved',
      [requester],
      {
        title: `Reassignment applied: ${input.institutionId}`,
        body: `The administrator applied your suggestion. ${input.note}`,
        link: requesterLink(suggestion),
      },
    );
}

@Controller()
export class SupervisionController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /**
   * Supervisor records. Administrators see all; supervisors, the history of the institutions
   * they currently supervise; officers, the current supervisor of their own institutions.
   */
  @Get('supervision')
  @Roles('officer', 'supervisor', 'administrator')
  async supervision(@CurrentUser() user: User): Promise<Supervision[]> {
    const scope =
      user.role === 'supervisor'
        ? await supervisedInstitutionIds(this.db, user.id)
        : user.role === 'officer'
          ? await assignedInstitutionIds(this.db, user.id)
          : null;
    const rows = await this.db
      .select({ record: supervisions, supervisorName: users.displayName })
      .from(supervisions)
      .innerJoin(users, eq(users.id, supervisions.supervisorId))
      .orderBy(asc(supervisions.id));
    return rows
      .filter(
        ({ record }) =>
          scope === null ||
          (scope.includes(record.institutionId) &&
            (user.role === 'supervisor' || record.validTo === null)),
      )
      .map(({ record, supervisorName }) => ({
        institutionId: record.institutionId as Supervision['institutionId'],
        supervisorId: record.supervisorId,
        supervisorName,
        validFrom: record.validFrom,
        validTo: record.validTo,
        reason: record.reason,
      }));
  }

  /** Assigns or changes an institution's supervisor; access follows at once (PRD §5.2). */
  @Post('supervision')
  @HttpCode(200)
  @Roles('administrator')
  changeSupervisor(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = supervisionChangeRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose a supervisor and give a reason of at least 10 characters.',
          'invalid_request',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const { institutionId, supervisorId, reason } = parsed.data;
      const supervisor = await activeUser(tx, supervisorId, 'supervisor');
      const [institution] = await tx
        .select({ id: institutions.id })
        .from(institutions)
        .where(eq(institutions.id, institutionId));
      if (!supervisor || !institution) throw notFound();
      const changed = await this.moveSupervision(
        tx,
        businessTime,
        admin,
        supervisor,
        [institutionId],
        reason,
      );
      if (!changed.length)
        throw new ApiError(
          409,
          'This supervisor is already assigned.',
          'no_change',
        );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${institutionId}:supervised`),
        'supervision.changed',
        [supervisor],
        {
          title: `${institutionId} is now in your oversight`,
          body: 'You can see its reports, reviews and results from now on.',
          link: `/supervisor/institutions/${institutionId}`,
        },
      );
      return { ok: true };
    });
  }

  /** Ends current supervision and starts the new one for each institution that changes. */
  private async moveSupervision(
    tx: Tx,
    businessTime: string,
    admin: User,
    supervisor: User,
    institutionIds: string[],
    reason: string,
  ) {
    const current = await tx
      .select()
      .from(supervisions)
      .where(
        and(
          inArray(supervisions.institutionId, institutionIds),
          isNull(supervisions.validTo),
        ),
      );
    const changed = institutionIds.filter(
      (id) =>
        current.find((record) => record.institutionId === id)?.supervisorId !==
        supervisor.id,
    );
    for (const institutionId of changed) {
      await tx
        .update(supervisions)
        .set({ validTo: businessTime })
        .where(
          and(
            eq(supervisions.institutionId, institutionId),
            isNull(supervisions.validTo),
          ),
        );
      await tx.insert(supervisions).values({
        institutionId,
        supervisorId: supervisor.id,
        validFrom: businessTime,
        validTo: null,
        reason,
      });
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'supervision.change',
        { type: 'supervision', id: institutionId },
        `${institutionId} supervised by ${supervisor.displayName}: ${reason}`,
      );
    }
    return changed;
  }

  /** Every assignment record in the caller's scope, including ended ones and cover. */
  @Get('assignments/history')
  @Roles('administrator', 'supervisor', 'officer')
  async history(@CurrentUser() user: User) {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    return toAssignments(
      this.db,
      await this.db
        .select()
        .from(assignments)
        .where(inArray(assignments.institutionId, readable))
        .orderBy(asc(assignments.id)),
    );
  }

  /** Reassignment takes effect immediately for access; history keeps earlier reviewers (FR01, AT22). */
  @Post('assignments')
  @HttpCode(200)
  @Roles('administrator')
  reassign(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = assignmentChangeRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose an officer and give a reason of at least 10 characters.',
          'invalid_request',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const { institutionId, coverUntil, handoverNote, suggestionId } =
        parsed.data;
      const reason = parsed.data.reason.trim();
      const officer = await activeUser(tx, parsed.data.officerId, 'officer');
      const [institution] = await tx
        .select({ id: institutions.id })
        .from(institutions)
        .where(eq(institutions.id, institutionId));
      if (!officer || !institution) throw notFound();
      // No current assignment: the institution was created without a reviewing officer.
      const current = await currentAssignment(tx, institutionId);
      if (!current && coverUntil)
        throw new ApiError(
          422,
          'Cover needs a current officer to return to. Assign the officer without cover.',
          'invalid_request',
          { coverUntil: 'Leave cover empty for a first assignment.' },
        );
      if (current?.officerId === officer.id)
        throw new ApiError(
          409,
          'This officer is already assigned.',
          'no_change',
        );
      if (coverUntil && coverUntil <= localDate(businessTime))
        throw new ApiError(
          422,
          'Cover must end after today.',
          'invalid_request',
          {
            coverUntil: 'Choose a date after today.',
          },
        );
      await reassignInstitution(tx, this.events, businessTime, {
        institutionId,
        officer,
        reason,
        actor: admin,
        coverUntil,
        handoverNote,
      });
      if (suggestionId)
        await applySuggestion(tx, this.events, businessTime, {
          suggestionId,
          institutionId,
          resolvedById: admin.id,
          note: `${institutionId} now goes to ${officer.displayName}. ${reason}`,
        });
      return { ok: true };
    });
  }

  @Get('assignment-suggestions')
  @Roles('officer', 'supervisor', 'administrator')
  async suggestions(
    @CurrentUser() user: User,
  ): Promise<ReassignmentSuggestion[]> {
    // Supervisors also see officers' declarations about their institutions.
    const supervised =
      user.role === 'supervisor'
        ? await supervisedInstitutionIds(this.db, user.id)
        : [];
    const rows = await this.db
      .select()
      .from(suggestions)
      .orderBy(desc(suggestions.seq));
    return toSuggestions(
      this.db,
      rows.filter(
        (suggestion) =>
          user.role === 'administrator' ||
          suggestion.suggestedById === user.id ||
          supervised.includes(suggestion.institutionId),
      ),
    );
  }

  /**
   * A supervisor suggests a reassignment, or an officer declares a conflict of interest about
   * their own institution. Only the administrator can apply either.
   */
  @Post('assignment-suggestions')
  @Roles('supervisor', 'officer')
  suggest(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = reassignmentSuggestionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Give a reason of at least 10 characters.',
          'invalid_request',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const { kind, institutionId, suggestedOfficerId, reason } = parsed.data;
      const inScope =
        user.role === 'officer'
          ? await assignedInstitutionIds(tx, user.id)
          : await supervisedInstitutionIds(tx, user.id);
      if (!inScope.includes(institutionId)) throw notFound();
      if (user.role === 'officer' && kind !== 'conflict_of_interest')
        throw new ApiError(
          403,
          'Officers can declare a conflict of interest; reassignment suggestions come from supervisors.',
          'forbidden',
        );
      const current =
        (await currentAssignment(tx, institutionId))?.officerId ?? null;
      if (suggestedOfficerId !== null) {
        const officer = await activeUser(tx, suggestedOfficerId, 'officer');
        if (!officer)
          throw new ApiError(
            422,
            'Choose an active officer.',
            'invalid_request',
            { suggestedOfficerId: 'Choose an active officer.' },
          );
        if (officer.id === current)
          throw new ApiError(
            422,
            'This officer already reviews the institution.',
            'invalid_request',
            { suggestedOfficerId: 'Choose a different officer.' },
          );
      }
      const [open] = await tx
        .select({ id: suggestions.id })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.institutionId, institutionId),
            eq(suggestions.status, 'open'),
          ),
        );
      if (open)
        throw new ApiError(
          409,
          'A request for this institution is already waiting for the administrator.',
          'suggestion_open',
        );
      const [row] = await tx
        .insert(suggestions)
        .values({
          id: await nextId(tx, 'sug'),
          kind,
          requestedByRole: user.role as 'supervisor' | 'officer',
          institutionId,
          currentOfficerId: current,
          suggestedOfficerId,
          reason,
          suggestedById: user.id,
          at: businessTime,
          status: 'open',
        })
        .returning();
      const conflict = kind === 'conflict_of_interest';
      await this.events.audit(
        tx,
        businessTime,
        user,
        conflict ? 'assignment.conflict_declared' : 'assignment.suggest',
        { type: 'assignment', id: institutionId },
        `${conflict ? 'Conflict of interest declared for' : 'Suggested reassignment of'} ${institutionId}: ${reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${row!.id}:suggested`,
        'assignment.suggested',
        await usersWithRole(tx, 'administrator'),
        {
          title: conflict
            ? `Conflict of interest declared: ${institutionId}`
            : `Reassignment suggested: ${institutionId}`,
          body: conflict
            ? `${user.displayName} asks not to review ${institutionId}. Reassign it under Assignments.`
            : `${user.displayName} suggests a different officer. Review it under Assignments.`,
          link: '/admin/assignments',
        },
      );
      if (conflict)
        await this.events.notify(
          tx,
          businessTime,
          `${row!.id}:supervisor`,
          'assignment.suggested',
          await assignedSupervisors(tx, institutionId),
          {
            title: `Conflict of interest declared: ${institutionId}`,
            body: `${user.displayName} asks not to review ${institutionId}. The administrator decides.`,
            link: '/supervisor/assignments',
          },
        );
      return (await toSuggestions(tx, [row!]))[0]!;
    });
  }

  @Post('assignment-suggestions/:suggestionId/dismiss')
  @HttpCode(200)
  @Roles('administrator')
  dismiss(
    @CurrentUser() admin: User,
    @Param('suggestionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = suggestionDismissRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Explain the decision in at least 10 characters.',
          'invalid_request',
          { note: 'Explain the decision in at least 10 characters.' },
        );
      const [suggestion] = await tx
        .select()
        .from(suggestions)
        .where(eq(suggestions.id, id));
      if (!suggestion) throw notFound();
      if (suggestion.status !== 'open')
        throw new ApiError(
          409,
          'This suggestion has already been resolved.',
          'suggestion_resolved',
        );
      const [dismissed] = await tx
        .update(suggestions)
        .set({
          status: 'dismissed',
          resolvedById: admin.id,
          resolvedAt: businessTime,
          resolutionNote: parsed.data.note,
        })
        .where(eq(suggestions.id, id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'assignment.suggestion_dismiss',
        { type: 'assignment', id: suggestion.institutionId },
        `Kept the current officer for ${suggestion.institutionId}: ${parsed.data.note}`,
      );
      const [requester] = await tx
        .select()
        .from(users)
        .where(
          and(eq(users.id, suggestion.suggestedById), eq(users.active, true)),
        );
      if (requester)
        await this.events.notify(
          tx,
          businessTime,
          `${suggestion.id}:dismissed`,
          'assignment.suggestion_resolved',
          [requester],
          {
            title: `Reassignment not applied: ${suggestion.institutionId}`,
            body: parsed.data.note,
            link: requesterLink(suggestion),
          },
        );
      return (await toSuggestions(tx, [dismissed!]))[0]!;
    });
  }

  /** Many institutions to one officer; each keeps its own history entry and notifications. */
  @Post('assignments/bulk')
  @HttpCode(200)
  @Roles('administrator')
  bulkAssign(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = bulkAssignmentRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose institutions, an officer and a reason of at least 10 characters.',
          'invalid_request',
        );
      const officer = await activeUser(tx, parsed.data.officerId, 'officer');
      if (!officer) throw notFound();
      const ids = [...new Set(parsed.data.institutionIds)];
      const current = new Map<string, string>();
      for (const id of ids) {
        const record = await currentAssignment(tx, id);
        if (record) current.set(id, record.officerId);
      }
      const unknown = ids.filter((id) => !current.has(id));
      if (unknown.length)
        throw new ApiError(
          422,
          `Unknown institutions: ${unknown.join(', ')}.`,
          'invalid_request',
        );
      const changed = ids.filter((id) => current.get(id) !== officer.id);
      for (const institutionId of changed)
        await reassignInstitution(tx, this.events, businessTime, {
          institutionId,
          officer,
          reason: parsed.data.reason,
          actor: admin,
          handoverNote: parsed.data.handoverNote,
        });
      return {
        changed,
        unchanged: ids.filter((id) => !changed.includes(id)),
      };
    });
  }

  @Post('supervision/bulk')
  @HttpCode(200)
  @Roles('administrator')
  bulkSupervise(@CurrentUser() admin: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = bulkSupervisionRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Choose institutions, a supervisor and a reason of at least 10 characters.',
          'invalid_request',
        );
      const supervisor = await activeUser(
        tx,
        parsed.data.supervisorId,
        'supervisor',
      );
      if (!supervisor) throw notFound();
      const ids = [...new Set(parsed.data.institutionIds)];
      const known = (
        await tx
          .select({ id: institutions.id })
          .from(institutions)
          .where(inArray(institutions.id, ids))
      ).map((row) => row.id);
      const unknown = ids.filter((id) => !known.includes(id));
      if (unknown.length)
        throw new ApiError(
          422,
          `Unknown institutions: ${unknown.join(', ')}.`,
          'invalid_request',
        );
      const changed = await this.moveSupervision(
        tx,
        businessTime,
        admin,
        supervisor,
        ids,
        parsed.data.reason,
      );
      if (changed.length)
        await this.events.notify(
          tx,
          businessTime,
          await nextId(tx, 'bulk-supervision'),
          'supervision.changed',
          [supervisor],
          {
            title: `${plural(changed.length, 'institution is', 'institutions are')} now in your oversight`,
            body: `${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''}. ${parsed.data.reason}`,
            link: '/supervisor/institutions',
          },
        );
      return {
        changed,
        unchanged: ids.filter((id) => !changed.includes(id)),
      };
    });
  }
}
