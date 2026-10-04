import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { User } from '../auth/sessions';
import { DB, type Database, type Db } from '../database/db';
import {
  assignments,
  institutions,
  suggestions,
  supervisions,
  users,
} from '../database/schema';

export type SuggestionRow = typeof suggestions.$inferSelect;
type NewSuggestion = typeof suggestions.$inferInsert;

@Injectable()
export class SupervisionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Internal user row (includes credentials); never returned to clients. */
  async activeUser(id: string, role: User['role'], db: Db = this.db) {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(eq(users.id, id), eq(users.role, role), eq(users.active, true)),
      );
    return user;
  }

  /** Internal user row of any role, if active. */
  async activeUserById(id: string, db: Db = this.db) {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.active, true)));
    return user;
  }

  /** Which of the given institutions exist. */
  async knownInstitutionIds(ids: string[], db: Db = this.db) {
    const rows = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(inArray(institutions.id, ids));
    return rows.map((row) => row.id);
  }

  /** User and institution names, for display. */
  names(db: Db = this.db) {
    return Promise.all([
      db.select({ id: users.id, name: users.displayName }).from(users),
      db
        .select({ id: institutions.id, name: institutions.name })
        .from(institutions),
    ]);
  }

  supervisionsWithNames() {
    return this.db
      .select({ record: supervisions, supervisorName: users.displayName })
      .from(supervisions)
      .innerJoin(users, eq(users.id, supervisions.supervisorId))
      .orderBy(asc(supervisions.id));
  }

  currentSupervisions(institutionIds: string[], db: Db = this.db) {
    return db
      .select()
      .from(supervisions)
      .where(
        and(
          inArray(supervisions.institutionId, institutionIds),
          isNull(supervisions.validTo),
        ),
      );
  }

  /** Ends the institution's current supervision and starts a new one. */
  async replaceSupervision(
    institutionId: string,
    supervisorId: string,
    businessTime: string,
    reason: string,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(supervisions)
      .set({ validTo: businessTime })
      .where(
        and(
          eq(supervisions.institutionId, institutionId),
          isNull(supervisions.validTo),
        ),
      );
    await db.insert(supervisions).values({
      institutionId,
      supervisorId,
      validFrom: businessTime,
      validTo: null,
      reason,
    });
  }

  /** Current assignments of the given institutions. */
  currentAssignments(institutionIds: string[], db: Db = this.db) {
    return db
      .select()
      .from(assignments)
      .where(
        and(
          inArray(assignments.institutionId, institutionIds),
          isNull(assignments.validTo),
        ),
      );
  }

  assignments(institutionIds: string[]) {
    return this.db
      .select()
      .from(assignments)
      .where(inArray(assignments.institutionId, institutionIds))
      .orderBy(asc(assignments.id));
  }

  suggestions() {
    return this.db.select().from(suggestions).orderBy(desc(suggestions.seq));
  }

  async suggestion(id: string, db: Db = this.db) {
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(eq(suggestions.id, id));
    return suggestion;
  }

  /** The open suggestion for the institution, optionally a specific one. */
  async openSuggestion(institutionId: string, id?: string, db: Db = this.db) {
    const [suggestion] = await db
      .select()
      .from(suggestions)
      .where(
        and(
          id ? eq(suggestions.id, id) : undefined,
          eq(suggestions.institutionId, institutionId),
          eq(suggestions.status, 'open'),
        ),
      );
    return suggestion;
  }

  async insertSuggestion(
    values: NewSuggestion,
    db: Db = this.db,
  ): Promise<SuggestionRow> {
    const [row] = await db.insert(suggestions).values(values).returning();
    return row!;
  }

  async resolveSuggestion(
    id: string,
    resolution: Pick<
      NewSuggestion,
      'status' | 'resolvedById' | 'resolvedAt' | 'resolutionNote'
    >,
    db: Db = this.db,
  ): Promise<SuggestionRow | undefined> {
    const [row] = await db
      .update(suggestions)
      .set(resolution)
      .where(eq(suggestions.id, id))
      .returning();
    return row;
  }
}
