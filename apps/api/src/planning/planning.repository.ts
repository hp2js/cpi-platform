import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  amendments,
  baselines,
  periods,
  plannedMilestones,
} from '../database/schema';
import type { BaselineRow } from './plans';

type AmendmentRow = typeof amendments.$inferSelect;
type NewAmendment = typeof amendments.$inferInsert;

@Injectable()
export class PlanningRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async period(id: string, db: Db = this.db) {
    const [period] = await db.select().from(periods).where(eq(periods.id, id));
    return period;
  }

  async baseline(
    id: string,
    db: Db = this.db,
  ): Promise<BaselineRow | undefined> {
    const [baseline] = await db
      .select()
      .from(baselines)
      .where(eq(baselines.id, id));
    return baseline;
  }

  async insertBaseline(
    values: BaselineRow,
    db: Db = this.db,
  ): Promise<BaselineRow> {
    const [row] = await db.insert(baselines).values(values).returning();
    return row!;
  }

  async updateBaseline(
    id: string,
    changes: Partial<BaselineRow>,
    db: Db = this.db,
  ): Promise<BaselineRow | undefined> {
    const [row] = await db
      .update(baselines)
      .set(changes)
      .where(eq(baselines.id, id))
      .returning();
    return row;
  }

  async amendment(
    id: string,
    db: Db = this.db,
  ): Promise<AmendmentRow | undefined> {
    const [amendment] = await db
      .select()
      .from(amendments)
      .where(eq(amendments.id, id));
    return amendment;
  }

  async hasPendingAmendment(milestoneId: string, db: Db = this.db) {
    const [pending] = await db
      .select({ id: amendments.id })
      .from(amendments)
      .where(
        and(
          eq(amendments.milestoneId, milestoneId),
          eq(amendments.status, 'pending'),
        ),
      );
    return Boolean(pending);
  }

  async insertAmendment(
    values: NewAmendment,
    db: Db = this.db,
  ): Promise<AmendmentRow> {
    const [row] = await db.insert(amendments).values(values).returning();
    return row!;
  }

  async updateAmendment(
    id: string,
    changes: Partial<NewAmendment>,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(amendments).set(changes).where(eq(amendments.id, id));
  }

  async movePlannedMilestone(id: string, periodId: string, db: Db = this.db) {
    await db
      .update(plannedMilestones)
      .set({ periodId })
      .where(eq(plannedMilestones.id, id));
  }

  async deletePlannedMilestone(id: string, db: Db = this.db) {
    await db.delete(plannedMilestones).where(eq(plannedMilestones.id, id));
  }
}
