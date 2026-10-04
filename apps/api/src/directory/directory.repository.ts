import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AccountingOfficer, Institution } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import {
  assignments,
  institutions,
  obligations,
  users,
} from '../database/schema';

/** The institution as clients see it. */
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

@Injectable()
export class DirectoryRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  institutions(ids: string[]): Promise<Institution[]> {
    return this.db
      .select(institutionColumns)
      .from(institutions)
      .where(inArray(institutions.id, ids))
      .orderBy(asc(institutions.id));
  }

  async institution(id: string): Promise<Institution | undefined> {
    const [institution] = await this.db
      .select(institutionColumns)
      .from(institutions)
      .where(eq(institutions.id, id));
    return institution;
  }

  obligations(institutionIds: string[]) {
    return this.db
      .select()
      .from(obligations)
      .where(inArray(obligations.institutionId, institutionIds))
      .orderBy(asc(obligations.id));
  }

  /** Assignments of the given institutions, optionally only one officer's. */
  assignments(institutionIds: string[], officerId?: string) {
    return this.db
      .select()
      .from(assignments)
      .where(
        and(
          inArray(assignments.institutionId, institutionIds),
          officerId ? eq(assignments.officerId, officerId) : undefined,
        ),
      )
      .orderBy(asc(assignments.id));
  }

  /** The current reviewing officer's name. */
  async reviewerName(institutionId: string): Promise<string | undefined> {
    const [reviewer] = await this.db
      .select({ name: users.displayName })
      .from(assignments)
      .innerJoin(users, eq(users.id, assignments.officerId))
      .where(
        and(
          eq(assignments.institutionId, institutionId),
          isNull(assignments.validTo),
        ),
      );
    return reviewer?.name;
  }

  /** Full user rows (internal: they include credentials); map before returning. */
  focalPersons(institutionId: string) {
    return this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, 'institution'),
          eq(users.institutionId, institutionId),
        ),
      )
      .orderBy(asc(users.id));
  }

  async institutionRow(id: string, db: Db = this.db) {
    const [institution] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.id, id));
    return institution;
  }

  async setAccountingOfficer(
    id: string,
    accountingOfficer: AccountingOfficer,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(institutions)
      .set({ accountingOfficer })
      .where(eq(institutions.id, id));
  }
}
