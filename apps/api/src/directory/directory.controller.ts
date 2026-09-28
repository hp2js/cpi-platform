import { Controller, Get, Param, Query } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Assignment, Cycle, Institution } from '@cpi/contracts';
import { canReadInstitution, readableInstitutionIds } from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import {
  assignments,
  institutions,
  obligations,
  users,
} from '../database/schema';
import { loadCycle } from '../database/state';
import { notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { toObligations } from './obligations';

const institutionColumns = {
  id: institutions.id,
  name: institutions.name,
  typeId: institutions.typeId,
  type: institutions.type,
  active: institutions.active,
  accountingOfficer: institutions.accountingOfficer,
};

@Controller()
export class DirectoryController {
  constructor(private readonly infrastructure: Infrastructure) {}

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
    return toObligations(this.db, rows);
  }

  @Get('assignments')
  @Roles('officer', 'supervisor', 'administrator')
  async assignments(@CurrentUser() user: User): Promise<Assignment[]> {
    return this.db
      .select({
        institutionId: assignments.institutionId,
        officerId: assignments.officerId,
        officerName: users.displayName,
        validFrom: assignments.validFrom,
        validTo: assignments.validTo,
      })
      .from(assignments)
      .innerJoin(users, eq(users.id, assignments.officerId))
      .where(
        user.role === 'officer'
          ? eq(assignments.officerId, user.id)
          : undefined,
      )
      .orderBy(asc(assignments.id));
  }
}
