import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  archivedPublications,
  closedYears,
  financialYearChanges,
  institutions,
  plannedYears,
  publications,
} from '../database/schema';

/** Planned financial years and the change log (HP2-100). */
@Injectable()
export class YearsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  planned(db: Db = this.db) {
    return db.select().from(plannedYears).orderBy(asc(plannedYears.startsOn));
  }

  async plannedYear(id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(plannedYears)
      .where(eq(plannedYears.id, id));
    return row;
  }

  async insert(values: typeof plannedYears.$inferInsert, db: Db = this.db) {
    await db.insert(plannedYears).values(values);
  }

  async remove(id: string, db: Db = this.db) {
    await db.delete(plannedYears).where(eq(plannedYears.id, id));
  }

  closed(db: Db = this.db) {
    return db.select().from(closedYears).orderBy(asc(closedYears.startsOn));
  }

  async closedYear(id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(closedYears)
      .where(eq(closedYears.id, id));
    return row;
  }

  activeInstitutions(db: Db = this.db) {
    return db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.active, true))
      .orderBy(asc(institutions.id));
  }

  institutionNames(db: Db = this.db) {
    return db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions);
  }

  /** The active year's current (not superseded) releases. */
  currentPublications(db: Db = this.db) {
    return db
      .select({ institutionId: publications.institutionId })
      .from(publications)
      .where(isNull(publications.supersededBy));
  }

  /** The active year's releases, every version, to archive when the year closes. */
  publications(db: Db = this.db) {
    return db.select().from(publications).orderBy(asc(publications.seq));
  }

  async archive(
    year: typeof closedYears.$inferInsert,
    releases: (typeof archivedPublications.$inferInsert)[],
    db: Db = this.db,
  ) {
    await db.insert(closedYears).values(year);
    if (releases.length) await db.insert(archivedPublications).values(releases);
  }

  archivedPublications(
    yearId: string,
    institutionIds: string[],
    db: Db = this.db,
  ) {
    return db
      .select()
      .from(archivedPublications)
      .where(
        and(
          eq(archivedPublications.yearId, yearId),
          inArray(archivedPublications.institutionId, institutionIds),
        ),
      )
      .orderBy(desc(archivedPublications.seq));
  }

  changes(db: Db = this.db) {
    return db
      .select({
        at: financialYearChanges.at,
        by: financialYearChanges.by,
        yearId: financialYearChanges.yearId,
        summary: financialYearChanges.summary,
        reason: financialYearChanges.reason,
      })
      .from(financialYearChanges)
      .orderBy(desc(financialYearChanges.id));
  }

  async insertChange(
    values: typeof financialYearChanges.$inferInsert,
    db: Db = this.db,
  ) {
    await db.insert(financialYearChanges).values(values);
  }
}
