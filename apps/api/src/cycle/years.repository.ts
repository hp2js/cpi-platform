import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import { financialYearChanges, plannedYears } from '../database/schema';

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
