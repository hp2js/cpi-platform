import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  cycles,
  reportIdentityChanges,
  reportImages,
} from '../database/schema';

type ImageRow = typeof reportImages.$inferInsert;

/** The cycle's report identity, its change history and its images (HP2-65). */
@Injectable()
export class ReportIdentityRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  changes(db: Db = this.db) {
    return db
      .select({
        at: reportIdentityChanges.at,
        by: reportIdentityChanges.by,
        summary: reportIdentityChanges.summary,
      })
      .from(reportIdentityChanges)
      .orderBy(desc(reportIdentityChanges.id));
  }

  async insertChange(
    values: typeof reportIdentityChanges.$inferInsert,
    db: Db = this.db,
  ) {
    await db.insert(reportIdentityChanges).values(values);
  }

  async setIdentity(
    cycleId: string,
    identity: (typeof cycles.$inferInsert)['reportIdentity'],
    db: Db = this.db,
  ) {
    await db
      .update(cycles)
      .set({ reportIdentity: identity })
      .where(eq(cycles.id, cycleId));
  }

  async insertImage(values: ImageRow, db: Db = this.db) {
    await db.insert(reportImages).values(values);
  }

  async image(id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(reportImages)
      .where(eq(reportImages.id, id));
    return row;
  }
}
