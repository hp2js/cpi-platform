import { Inject, Injectable } from '@nestjs/common';
import { eq, ne } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import { formVersions, obligations } from '../database/schema';

type FormRow = typeof formVersions.$inferSelect;
type NewForm = typeof formVersions.$inferInsert;

@Injectable()
export class FormsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async form(id: string, db: Db = this.db): Promise<FormRow | undefined> {
    const [form] = await db
      .select()
      .from(formVersions)
      .where(eq(formVersions.id, id));
    return form;
  }

  /** Periods in which any institution has started reporting. */
  async startedPeriodIds(db: Db = this.db): Promise<string[]> {
    const rows = await db
      .selectDistinct({ periodId: obligations.periodId })
      .from(obligations)
      .where(ne(obligations.state, 'not_started'));
    return rows.map((row) => row.periodId);
  }

  async insertForm(values: NewForm, db: Db = this.db): Promise<FormRow> {
    const [form] = await db.insert(formVersions).values(values).returning();
    return form!;
  }

  async updateForm(
    id: string,
    changes: Partial<NewForm>,
    db: Db = this.db,
  ): Promise<FormRow | undefined> {
    const [form] = await db
      .update(formVersions)
      .set(changes)
      .where(eq(formVersions.id, id))
      .returning();
    return form;
  }

  /** The scoring profile is locked for the cycle from the first publication (PRD §7.1). */
  async lockWeights(db: Db = this.db): Promise<void> {
    await db.update(formVersions).set({ weightsLocked: true });
  }

  async deleteForm(id: string, db: Db = this.db): Promise<void> {
    await db.delete(formVersions).where(eq(formVersions.id, id));
  }
}
