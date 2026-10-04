import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  assignments,
  institutionTypes,
  institutions,
  supervisions,
  users,
} from '../database/schema';

type UserRow = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;
type InstitutionUpdate = Partial<typeof institutions.$inferInsert>;
type NewInstitutionType = typeof institutionTypes.$inferInsert;

/** Accounts, institutions and institution types (FR01). Rows are internal; map before returning. */
@Injectable()
export class PeopleRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Everything the People screen shows. */
  directory(db: Db = this.db) {
    return Promise.all([
      db.select().from(users).orderBy(asc(users.id)),
      db.select().from(assignments).where(isNull(assignments.validTo)),
      db.select().from(supervisions).where(isNull(supervisions.validTo)),
      db.select().from(institutions).orderBy(asc(institutions.id)),
      db
        .select()
        .from(institutionTypes)
        .orderBy(asc(institutionTypes.position)),
    ]);
  }

  async user(id: string, db: Db = this.db): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async emailTaken(email: string, db: Db = this.db): Promise<boolean> {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    return Boolean(taken);
  }

  async insertUser(values: NewUser, db: Db = this.db): Promise<UserRow> {
    const [user] = await db.insert(users).values(values).returning();
    return user!;
  }

  async updateUser(id: string, changes: Partial<NewUser>, db: Db = this.db) {
    await db.update(users).set(changes).where(eq(users.id, id));
  }

  /** The institution's focal persons, whatever their status. */
  focalPersons(institutionId: string, db: Db = this.db) {
    return db
      .select()
      .from(users)
      .where(
        and(
          eq(users.role, 'institution'),
          eq(users.institutionId, institutionId),
        ),
      );
  }

  /** Institutions the officer currently reviews, in no particular order. */
  async currentAssignments(officerId: string, db: Db = this.db) {
    const rows = await db
      .select({ institutionId: assignments.institutionId })
      .from(assignments)
      .where(
        and(eq(assignments.officerId, officerId), isNull(assignments.validTo)),
      );
    return rows.map((row) => row.institutionId);
  }

  async institution(id: string, db: Db = this.db) {
    const [institution] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.id, id));
    return institution;
  }

  async updateInstitution(
    id: string,
    changes: InstitutionUpdate,
    db: Db = this.db,
  ) {
    await db.update(institutions).set(changes).where(eq(institutions.id, id));
  }

  institutionTypes(db: Db = this.db) {
    return db.select().from(institutionTypes);
  }

  async institutionType(id: string, db: Db = this.db) {
    const [type] = await db
      .select()
      .from(institutionTypes)
      .where(eq(institutionTypes.id, id));
    return type;
  }

  async insertInstitutionType(values: NewInstitutionType, db: Db = this.db) {
    await db.insert(institutionTypes).values(values);
  }

  /** Institutions show the current label; their type ID never changes. */
  async updateInstitutionType(
    id: string,
    changes: { label: string; active: boolean },
    db: Db = this.db,
  ) {
    await db
      .update(institutionTypes)
      .set(changes)
      .where(eq(institutionTypes.id, id));
    await db
      .update(institutions)
      .set({ type: changes.label })
      .where(eq(institutions.typeId, id));
  }
}
