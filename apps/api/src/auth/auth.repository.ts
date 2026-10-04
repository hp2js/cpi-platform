import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import { assignments, institutions, users } from '../database/schema';

type UserRow = typeof users.$inferSelect;
type UserUpdate = Partial<typeof users.$inferInsert>;

/** Accounts for sign-in and self-service. Rows include credentials: never return them as-is. */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Every account with its institution's name, for the demo account list. */
  usersWithInstitution() {
    return this.db
      .select({ user: users, institutionName: institutions.name })
      .from(users)
      .leftJoin(institutions, eq(institutions.id, users.institutionId))
      .orderBy(asc(users.id));
  }

  async user(id: string, db: Db = this.db): Promise<UserRow | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  /** `email` must already be lower-case. */
  async userByEmail(
    email: string,
    db: Db = this.db,
  ): Promise<UserRow | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    return user;
  }

  async userByLinkHash(
    tokenHash: string,
    db: Db = this.db,
  ): Promise<UserRow | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`${users.authLink} ->> 'tokenHash' = ${tokenHash}`);
    return user;
  }

  async updateUser(
    id: string,
    changes: UserUpdate,
    db: Db = this.db,
  ): Promise<UserRow> {
    const [updated] = await db
      .update(users)
      .set(changes)
      .where(eq(users.id, id))
      .returning();
    return updated!;
  }

  async institution(id: string, db: Db = this.db) {
    const [institution] = await db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, id));
    return institution;
  }

  /** The institution's current reviewing officer's name. */
  async reviewerName(institutionId: string, db: Db = this.db) {
    const [reviewer] = await db
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
}
