import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  FICTIONAL_EMAIL,
  FICTIONAL_EMAIL_MESSAGE,
  type institutionCreateSchema,
  type institutionImportRequestSchema,
  type institutionTypeUpdateSchema,
  type institutionUpdateSchema,
  type userCreateSchema,
  type userRoleChangeSchema,
  type userStatusSchema,
  type userUpdateSchema,
  type People,
} from '@cpi/contracts';
import { inviter } from '../auth/invitations';
import { accountStatus, invitationExpiresAt } from '../auth/passwords';
import {
  assignedInstitutionIds,
  supervisedInstitutionIds,
} from '../auth/scope';
import { Sessions, type User } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import { Mailer } from '../email/mailer';
import {
  Events,
  assignedOfficers,
  institutionUsers,
  usersWithRole,
} from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import {
  accountingOfficerProblems,
  createInstitution,
  directorySnapshot,
  fromCreateRequest,
  institutionProblems,
  previewImport,
  type NewInstitution,
} from './onboarding';
import { PeopleRepository } from './people.repository';

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

/** Users, institutions and institution types (FR01). Every change is audited. */
@Injectable()
export class PeopleService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: PeopleRepository,
    private readonly events: Events,
    private readonly sessions: Sessions,
    private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  /* Users and institutions (FR01) */

  list(): Promise<People> {
    return this.people(this.db);
  }

  createUser(admin: User, input: z.infer<typeof userCreateSchema>) {
    return write(this.db, async (tx, businessTime, afterCommit) => {
      // Demonstration deployments hold synthetic data only.
      if (this.config.DEMO_MODE && !FICTIONAL_EMAIL.test(input.email))
        throw new ApiError(
          422,
          'Some values need attention.',
          'invalid_settings',
          { email: FICTIONAL_EMAIL_MESSAGE },
        );
      if (await this.repository.emailTaken(input.email, tx))
        throw new ApiError(
          422,
          'Some values need attention.',
          'invalid_settings',
          {
            email: 'Another account already uses this address.',
          },
        );
      if (
        input.institutionId &&
        !(await this.repository.institution(input.institutionId, tx))
      )
        throw notFound();
      const user = await this.repository.insertUser(
        {
          id: await nextId(tx, 'user'),
          displayName: input.displayName,
          email: input.email,
          role: input.role,
          jobTitle: input.jobTitle,
          institutionId: input.institutionId,
          active: true,
        },
        tx,
      );
      // A random temporary password is emailed; the person replaces it at first sign-in.
      await inviter(this.mailer, admin, afterCommit)(tx, user);
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.create',
        { type: 'user', id: user.id },
        `${user.displayName} (${user.role}${user.institutionId ? `, ${user.institutionId}` : ''})`,
      );
      return this.people(tx);
    });
  }

  /** A new temporary password replaces the earlier one (e.g. it expired or the email was lost). */
  resendInvitation(admin: User, id: string) {
    return write(this.db, async (tx, businessTime, afterCommit) => {
      const user = await this.repository.user(id, tx);
      if (!user) throw notFound();
      if (accountStatus(user) !== 'invited')
        throw new ApiError(
          409,
          user.active
            ? 'This person has already set a password.'
            : 'Reactivate the account before inviting again.',
          'not_invited',
        );
      await inviter(this.mailer, admin, afterCommit)(tx, user);
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'user.invite',
        { type: 'user', id: user.id },
        `Invitation sent again to ${user.email}`,
      );
      return this.people(tx);
    });
  }

  updateUser(admin: User, id: string, input: z.infer<typeof userUpdateSchema>) {
    return write(this.db, async (tx, businessTime) => {
      const user = await this.repository.user(id, tx);
      if (!user) throw notFound();
      await this.repository.updateUser(
        id,
        { displayName: input.displayName, jobTitle: input.jobTitle },
        tx,
      );
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
      return this.people(tx);
    });
  }

  /**
   * Changes an account's role, keeping one identity and its history. Scope must be handed over
   * first; the person's sessions end so the new permissions apply at the next sign-in.
   */
  async changeRole(
    admin: User,
    id: string,
    input: z.infer<typeof userRoleChangeSchema>,
  ) {
    await write(this.db, async (tx, businessTime) => {
      const user = await this.repository.user(id, tx);
      if (!user) throw notFound();
      const { role, institutionId, reason } = input;
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
        const institution = institutionId
          ? await this.repository.institution(institutionId, tx)
          : undefined;
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
      if (await this.isLastFocalPerson(tx, user))
        throw new ApiError(
          409,
          `${user.displayName} is the only active focal person for ${user.institutionId}. Set up another before changing their role.`,
          'last_focal_person',
        );
      await this.repository.updateUser(
        id,
        { role, institutionId: role === 'institution' ? institutionId : null },
        tx,
      );
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

  userStatus(admin: User, id: string, input: z.infer<typeof userStatusSchema>) {
    return write(this.db, async (tx, businessTime) => {
      const user = await this.repository.user(id, tx);
      if (!user) throw notFound();
      if (user.id === admin.id)
        throw new ApiError(
          409,
          'You cannot deactivate your own account.',
          'self_deactivation',
        );
      if (!input.active) {
        const assigned = await this.repository.currentAssignments(user.id, tx);
        if (assigned.length)
          throw new ApiError(
            409,
            `Reassign ${assigned.join(', ')} before deactivating ${user.displayName}.`,
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
        if (
          !input.confirmNoFocalPerson &&
          (await this.isLastFocalPerson(tx, user))
        )
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
      await this.repository.updateUser(id, { active: input.active }, tx);
      await this.events.audit(
        tx,
        businessTime,
        admin,
        input.active ? 'user.reactivate' : 'user.deactivate',
        { type: 'user', id: user.id },
        `${user.displayName}: ${input.reason}`,
      );
      return this.people(tx);
    });
  }

  updateInstitution(
    admin: User,
    id: string,
    input: z.infer<typeof institutionUpdateSchema>,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institution = await this.repository.institution(id, tx);
      if (!institution) throw notFound();
      const type = await this.repository.institutionType(input.typeId, tx);
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
      await this.repository.updateInstitution(
        id,
        {
          name: input.name,
          typeId: type.id,
          type: type.label,
          accountingOfficer: {
            ...input.accountingOfficer,
            email: input.accountingOfficer.email.toLowerCase(),
          },
        },
        tx,
      );
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
      return this.people(tx);
    });
  }

  createType(admin: User, input: z.infer<typeof institutionTypeUpdateSchema>) {
    return write(this.db, async (tx, businessTime) => {
      const types = await this.repository.institutionTypes(tx);
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
      await this.repository.insertInstitutionType(
        { id, label: input.label, active: input.active },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution_type.create',
        { type: 'institution_type', id },
        input.label,
      );
      return this.people(tx);
    });
  }

  updateType(
    admin: User,
    id: string,
    input: z.infer<typeof institutionTypeUpdateSchema>,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const types = await this.repository.institutionTypes(tx);
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
      await this.repository.updateInstitutionType(
        id,
        { label: input.label, active: input.active },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution_type.update',
        { type: 'institution_type', id },
        `${input.label}: ${changes.join(', ') || 'no changes'}`,
      );
      return this.people(tx);
    });
  }

  createInstitution(
    admin: User,
    input: z.infer<typeof institutionCreateSchema>,
  ) {
    return write(this.db, async (tx, businessTime, afterCommit) => {
      const snapshot = await directorySnapshot(tx, this.config.DEMO_MODE);
      const candidate = fromCreateRequest(snapshot, input);
      const problems = institutionProblems(snapshot, candidate);
      if (problems.length)
        throw new ApiError(422, problems.join(' '), 'invalid_institution');
      await createInstitution(
        tx,
        businessTime,
        inviter(this.mailer, admin, afterCommit),
        admin,
        snapshot,
        { ...candidate, officer: candidate.officer ?? null },
        input.seedOpenedQuarters,
      );
      await this.events.audit(
        tx,
        businessTime,
        admin,
        'institution.create',
        { type: 'institution', id: candidate.id },
        `${candidate.name}, ${candidate.officer ? `reviewed by ${candidate.officer.displayName}` : 'no reviewing officer yet'}; Accounting Officer ${candidate.accountingOfficer.name}`,
      );
      await this.notifyOfficers(tx, businessTime, [candidate]);
      return this.people(tx);
    });
  }

  async previewImport(input: z.infer<typeof institutionImportRequestSchema>) {
    return previewImport(
      await directorySnapshot(this.db, this.config.DEMO_MODE),
      input.csv,
    ).preview;
  }

  /** All or nothing: one invalid row means nothing is created, so a file can be fixed and re-run. */
  importInstitutions(
    admin: User,
    input: z.infer<typeof institutionImportRequestSchema>,
  ) {
    return write(this.db, async (tx, businessTime, afterCommit) => {
      const snapshot = await directorySnapshot(tx, this.config.DEMO_MODE);
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
          inviter(this.mailer, admin, afterCommit),
          admin,
          snapshot,
          { ...row, officer: row.officer ?? null },
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
      if (row.officer)
        byOfficer.set(row.officer.id, [
          ...(byOfficer.get(row.officer.id) ?? []),
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

  private async people(db: Db): Promise<People> {
    const [userRows, current, supervised, institutionRows, typeRows] =
      await this.repository.directory(db);
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
          officer: officer
            ? { id: officer.id, name: officer.displayName }
            : null,
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

  /** An active focal person who is the only one for their institution. */
  private async isLastFocalPerson(tx: Tx, user: User) {
    if (
      user.role !== 'institution' ||
      !user.institutionId ||
      accountStatus(user) !== 'active'
    )
      return false;
    const colleagues = await this.repository.focalPersons(
      user.institutionId,
      tx,
    );
    return (
      colleagues.filter((person) => accountStatus(person) === 'active')
        .length === 1
    );
  }
}
