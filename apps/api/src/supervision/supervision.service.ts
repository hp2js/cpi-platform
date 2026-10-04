import { Inject, Injectable } from '@nestjs/common';
import {
  localDate,
  type Assignment,
  type ReassignmentSuggestion,
  type Supervision,
  type AssignmentChangeRequest,
  type BulkAssignmentRequest,
  type BulkSupervisionRequest,
  type ReassignmentSuggestionRequest,
  type SupervisionChangeRequest,
} from '@cpi/contracts';
import {
  assignedInstitutionIds,
  readableInstitutionIds,
  supervisedInstitutionIds,
} from '../auth/scope';
import type { User } from '../auth/sessions';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import { Events, assignedSupervisors, usersWithRole } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import {
  currentAssignment,
  reassignInstitution,
  toAssignments,
} from './assignments';
import {
  SupervisionRepository,
  type SuggestionRow,
} from './supervision.repository';

/*
 * Supervision, reassignment requests and bulk moves (PRD §5.2), ported from the mock API's
 * handlers/supervision.ts and handlers/admin.ts.
 */

type BulkResult = { changed: string[]; unchanged: string[] };

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const requesterLink = (suggestion: SuggestionRow) =>
  suggestion.requestedByRole === 'officer'
    ? `/officer/institutions/${suggestion.institutionId}`
    : '/supervisor/assignments';

@Injectable()
export class SupervisionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: SupervisionRepository,
    private readonly events: Events,
  ) {}

  /**
   * Administrators see all; supervisors, the history of the institutions they currently
   * supervise; officers, the current supervisor of their own institutions.
   */
  async supervision(user: User): Promise<Supervision[]> {
    const scope =
      user.role === 'supervisor'
        ? await supervisedInstitutionIds(this.db, user.id)
        : user.role === 'officer'
          ? await assignedInstitutionIds(this.db, user.id)
          : null;
    const rows = await this.repository.supervisionsWithNames();
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

  changeSupervisor(
    admin: User,
    input: SupervisionChangeRequest,
  ): Promise<{ ok: true }> {
    return write(this.db, async (tx, businessTime) => {
      const { institutionId, supervisorId, reason } = input;
      const supervisor = await this.repository.activeUser(
        supervisorId,
        'supervisor',
        tx,
      );
      const [institution] = await this.repository.knownInstitutionIds(
        [institutionId],
        tx,
      );
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
      return { ok: true as const };
    });
  }

  async history(user: User): Promise<Assignment[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    return toAssignments(this.db, await this.repository.assignments(readable));
  }

  reassign(admin: User, input: AssignmentChangeRequest): Promise<{ ok: true }> {
    return write(this.db, async (tx, businessTime) => {
      const { institutionId, coverUntil, handoverNote, suggestionId } = input;
      const reason = input.reason.trim();
      const officer = await this.repository.activeUser(
        input.officerId,
        'officer',
        tx,
      );
      const [institution] = await this.repository.knownInstitutionIds(
        [institutionId],
        tx,
      );
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
          { coverUntil: 'Choose a date after today.' },
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
        await this.applySuggestion(tx, businessTime, {
          suggestionId,
          institutionId,
          resolvedById: admin.id,
          note: `${institutionId} now goes to ${officer.displayName}. ${reason}`,
        });
      return { ok: true as const };
    });
  }

  /** Supervisors also see officers' declarations about their institutions. */
  async suggestions(user: User): Promise<ReassignmentSuggestion[]> {
    const supervised =
      user.role === 'supervisor'
        ? await supervisedInstitutionIds(this.db, user.id)
        : [];
    const rows = await this.repository.suggestions();
    return this.toSuggestions(
      this.db,
      rows.filter(
        (suggestion) =>
          user.role === 'administrator' ||
          suggestion.suggestedById === user.id ||
          supervised.includes(suggestion.institutionId),
      ),
    );
  }

  /** Officers may only declare a conflict of interest about their own institution. */
  suggest(
    user: User,
    input: ReassignmentSuggestionRequest,
  ): Promise<ReassignmentSuggestion> {
    return write(this.db, async (tx, businessTime) => {
      const { kind, institutionId, suggestedOfficerId, reason } = input;
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
        const officer = await this.repository.activeUser(
          suggestedOfficerId,
          'officer',
          tx,
        );
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
      if (await this.repository.openSuggestion(institutionId, undefined, tx))
        throw new ApiError(
          409,
          'A request for this institution is already waiting for the administrator.',
          'suggestion_open',
        );
      const row = await this.repository.insertSuggestion(
        {
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
        },
        tx,
      );
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
        `${row.id}:suggested`,
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
          `${row.id}:supervisor`,
          'assignment.suggested',
          await assignedSupervisors(tx, institutionId),
          {
            title: `Conflict of interest declared: ${institutionId}`,
            body: `${user.displayName} asks not to review ${institutionId}. The administrator decides.`,
            link: '/supervisor/assignments',
          },
        );
      return (await this.toSuggestions(tx, [row]))[0]!;
    });
  }

  dismiss(
    admin: User,
    id: string,
    note: string,
  ): Promise<ReassignmentSuggestion> {
    return write(this.db, async (tx, businessTime) => {
      const suggestion = await this.repository.suggestion(id, tx);
      if (!suggestion) throw notFound();
      if (suggestion.status !== 'open')
        throw new ApiError(
          409,
          'This suggestion has already been resolved.',
          'suggestion_resolved',
        );
      const dismissed = await this.repository.resolveSuggestion(
        id,
        {
          status: 'dismissed',
          resolvedById: admin.id,
          resolvedAt: businessTime,
          resolutionNote: note,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'assignment.suggestion_dismiss',
        { type: 'assignment', id: suggestion.institutionId },
        `Kept the current officer for ${suggestion.institutionId}: ${note}`,
      );
      const requester = await this.repository.activeUserById(
        suggestion.suggestedById,
        tx,
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
            body: note,
            link: requesterLink(suggestion),
          },
        );
      return (await this.toSuggestions(tx, [dismissed!]))[0]!;
    });
  }

  /** Each institution keeps its own history entry and notifications. */
  bulkAssign(admin: User, input: BulkAssignmentRequest): Promise<BulkResult> {
    return write(this.db, async (tx, businessTime) => {
      const officer = await this.repository.activeUser(
        input.officerId,
        'officer',
        tx,
      );
      if (!officer) throw notFound();
      const ids = [...new Set(input.institutionIds)];
      const current = new Map(
        (await this.repository.currentAssignments(ids, tx)).map((record) => [
          record.institutionId,
          record.officerId,
        ]),
      );
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
          reason: input.reason,
          actor: admin,
          handoverNote: input.handoverNote,
        });
      return {
        changed,
        unchanged: ids.filter((id) => !changed.includes(id)),
      };
    });
  }

  bulkSupervise(
    admin: User,
    input: BulkSupervisionRequest,
  ): Promise<BulkResult> {
    return write(this.db, async (tx, businessTime) => {
      const supervisor = await this.repository.activeUser(
        input.supervisorId,
        'supervisor',
        tx,
      );
      if (!supervisor) throw notFound();
      const ids = [...new Set(input.institutionIds)];
      const known = await this.repository.knownInstitutionIds(ids, tx);
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
        input.reason,
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
            body: `${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''}. ${input.reason}`,
            link: '/supervisor/institutions',
          },
        );
      return {
        changed,
        unchanged: ids.filter((id) => !changed.includes(id)),
      };
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
  ): Promise<string[]> {
    const current = await this.repository.currentSupervisions(
      institutionIds,
      tx,
    );
    const changed = institutionIds.filter(
      (id) =>
        current.find((record) => record.institutionId === id)?.supervisorId !==
        supervisor.id,
    );
    for (const institutionId of changed) {
      await this.repository.replaceSupervision(
        institutionId,
        supervisor.id,
        businessTime,
        reason,
        tx,
      );
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

  /** Marks an open suggestion for the institution applied and tells the requester. */
  private async applySuggestion(
    tx: Tx,
    businessTime: string,
    input: {
      suggestionId: string;
      institutionId: string;
      resolvedById: string;
      note: string;
    },
  ): Promise<void> {
    const suggestion = await this.repository.openSuggestion(
      input.institutionId,
      input.suggestionId,
      tx,
    );
    if (!suggestion) return;
    await this.repository.resolveSuggestion(
      suggestion.id,
      {
        status: 'applied',
        resolvedById: input.resolvedById,
        resolvedAt: businessTime,
        resolutionNote: input.note,
      },
      tx,
    );
    const requester = await this.repository.activeUserById(
      suggestion.suggestedById,
      tx,
    );
    if (requester)
      await this.events.notify(
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

  private async toSuggestions(
    db: Db,
    rows: SuggestionRow[],
  ): Promise<ReassignmentSuggestion[]> {
    const [people, places] = await this.repository.names(db);
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
}
