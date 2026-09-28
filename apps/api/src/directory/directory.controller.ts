import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  accountingOfficerSchema,
  type Assignment,
  type Cycle,
  type Institution,
  type InstitutionProfile,
} from '@cpi/contracts';
import { accountStatus } from '../auth/passwords';
import { canReadInstitution, readableInstitutionIds } from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write } from '../database/db';
import {
  assignments,
  institutions,
  obligations,
  users,
} from '../database/schema';
import { loadCycle } from '../database/state';
import { Events, assignedOfficers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { toAssignments } from '../supervision/assignments';
import { toObligations } from './obligations';

const institutionColumns = {
  id: institutions.id,
  name: institutions.name,
  typeId: institutions.typeId,
  type: institutions.type,
  active: institutions.active,
  accountingOfficer: institutions.accountingOfficer,
  /** Focal persons who can sign in; zero means nobody can report for the institution. */
  activeFocalPersons: sql<number>`(
    SELECT count(*)::int FROM ${users}
    WHERE ${users.institutionId} = "institutions"."id"
      AND ${users.role} = 'institution' AND ${users.active}
      AND ${users.passwordHash} IS NOT NULL
  )`,
};

@Controller()
export class DirectoryController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  @Get('cycles/current')
  cycle(): Promise<Cycle> {
    return loadCycle(this.db);
  }

  @Get('institutions')
  async institutions(@CurrentUser() user: User): Promise<Institution[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    return this.db
      .select(institutionColumns)
      .from(institutions)
      .where(inArray(institutions.id, readable))
      .orderBy(asc(institutions.id));
  }

  @Get('institutions/:institutionId')
  async institution(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
  ): Promise<Institution> {
    if (!(await canReadInstitution(this.db, user, id))) throw notFound();
    const [institution] = await this.db
      .select(institutionColumns)
      .from(institutions)
      .where(eq(institutions.id, id));
    if (!institution) throw notFound();
    return institution;
  }

  @Get('obligations')
  async obligations(
    @CurrentUser() user: User,
    @Query('institutionId') filter?: string,
  ) {
    const readable = await readableInstitutionIds(this.db, user);
    if (filter && !readable.includes(filter)) throw notFound();
    const scope = filter ? [filter] : readable;
    if (scope.length === 0) return [];
    const rows = await this.db
      .select()
      .from(obligations)
      .where(inArray(obligations.institutionId, scope))
      .orderBy(asc(obligations.id));
    return toObligations(
      this.db,
      rows,
      user.role === 'institution' ? 'institution' : 'internal',
    );
  }

  @Get('assignments')
  @Roles('officer', 'supervisor', 'administrator')
  async assignments(@CurrentUser() user: User): Promise<Assignment[]> {
    const readable = await readableInstitutionIds(this.db, user);
    if (readable.length === 0) return [];
    const rows = await this.db
      .select()
      .from(assignments)
      .where(
        and(
          inArray(assignments.institutionId, readable),
          user.role === 'officer'
            ? eq(assignments.officerId, user.id)
            : undefined,
        ),
      )
      .orderBy(asc(assignments.id));
    return toAssignments(this.db, rows);
  }

  /** A focal person's own institution: its record, reviewing officer and focal persons. */
  @Get('institution-profile')
  @Roles('institution')
  async profile(@CurrentUser() user: User): Promise<InstitutionProfile> {
    const [institution] = await this.db
      .select(institutionColumns)
      .from(institutions)
      .where(eq(institutions.id, user.institutionId ?? ''));
    if (!institution) throw notFound();
    const [reviewer] = await this.db
      .select({ name: users.displayName })
      .from(assignments)
      .innerJoin(users, eq(users.id, assignments.officerId))
      .where(
        and(
          eq(assignments.institutionId, institution.id),
          isNull(assignments.validTo),
        ),
      );
    const focal = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, 'institution'),
          eq(users.institutionId, institution.id),
        ),
      )
      .orderBy(asc(users.id));
    return {
      institution,
      reviewingOfficer: reviewer?.name ?? null,
      focalPersons: focal.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        jobTitle: person.jobTitle,
        email: person.email,
        status: accountStatus(person),
      })),
    };
  }

  /**
   * The institution knows first when its Accounting Officer changes, so its focal persons keep
   * the contact current. Name, type and ID stay with the administrator. Audited; the officer
   * is told.
   */
  @Put('institution-profile/accounting-officer')
  @Roles('institution')
  updateAccountingOfficer(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx, businessTime) => {
      const parsed = accountingOfficerSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fieldErrors[String(issue.path[0])] ??= issue.message;
        throw new ApiError(
          422,
          'Check the Accounting Officer’s details.',
          'invalid_request',
          fieldErrors,
        );
      }
      const [institution] = await tx
        .select()
        .from(institutions)
        .where(eq(institutions.id, user.institutionId ?? ''));
      if (!institution) throw notFound();
      const next = {
        ...parsed.data,
        email: parsed.data.email.toLowerCase(),
      };
      const before = institution.accountingOfficer?.name;
      await tx
        .update(institutions)
        .set({ accountingOfficer: next })
        .where(eq(institutions.id, institution.id));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'institution.accounting_officer',
        { type: 'institution', id: institution.id },
        before && before !== next.name
          ? `Accounting Officer changed from ${before} to ${next.name}`
          : `Accounting Officer contact updated (${next.name})`,
      );
      await this.events.notify(
        tx,
        businessTime,
        await nextId(tx, `${institution.id}:ao`),
        'institution.updated',
        await assignedOfficers(tx, institution.id),
        {
          title: `${institution.id} updated its Accounting Officer contact`,
          body: `${next.name}, ${next.designation}. Updated by ${user.displayName}.`,
          link: `/officer/institutions/${institution.id}`,
        },
      );
      return { ok: true };
    });
  }
}
