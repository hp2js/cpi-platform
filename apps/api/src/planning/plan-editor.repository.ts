import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  activities,
  baselines,
  foundationVersions,
  planApprovals,
  plannedMilestones,
  risks,
} from '../database/schema';

type NewRisk = typeof risks.$inferInsert;
type NewActivity = typeof activities.$inferInsert;
type NewPlannedMilestone = typeof plannedMilestones.$inferInsert;
type NewPlanApproval = typeof planApprovals.$inferInsert;
type NewBaseline = typeof baselines.$inferInsert;

/** The plan records that carry an institution-unique code. */
const coded = {
  risk: risks,
  activity: activities,
  milestone: plannedMilestones,
};
export type CodedRecord = keyof typeof coded;

@Injectable()
export class PlanEditorRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** IDs of the institution's records of this kind with this code. */
  async idsByCode(
    kind: CodedRecord,
    institutionId: string,
    code: string,
    db: Db = this.db,
  ): Promise<string[]> {
    const table = coded[kind];
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.institutionId, institutionId), eq(table.code, code)));
    return rows.map((row) => row.id);
  }

  /** The status of the quarter's latest baseline version, if any. */
  async latestBaselineStatus(
    institutionId: string,
    periodId: string,
    db: Db = this.db,
  ) {
    const [current] = await db
      .select({ status: baselines.status })
      .from(baselines)
      .where(
        and(
          eq(baselines.institutionId, institutionId),
          eq(baselines.periodId, periodId),
        ),
      )
      .orderBy(desc(baselines.version))
      .limit(1);
    return current?.status;
  }

  async insertBaseline(values: NewBaseline, db: Db = this.db): Promise<void> {
    await db.insert(baselines).values(values);
  }

  /** Whether any baseline version of the institution includes a milestone of the activity. */
  async activityInBaseline(
    institutionId: string,
    activityId: string,
    db: Db = this.db,
  ): Promise<boolean> {
    const rows = await db
      .select({ milestones: baselines.milestones })
      .from(baselines)
      .where(eq(baselines.institutionId, institutionId));
    return rows.some((row) =>
      row.milestones.some((item) => item.activityId === activityId),
    );
  }

  async hasMitigationPlanVersion(
    id: string,
    institutionId: string,
    db: Db = this.db,
  ): Promise<boolean> {
    const [version] = await db
      .select({ id: foundationVersions.id })
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.id, id),
          eq(foundationVersions.institutionId, institutionId),
          eq(foundationVersions.kind, 'mitigation_plan'),
        ),
      );
    return Boolean(version);
  }

  async savePlanApproval(
    values: NewPlanApproval,
    db: Db = this.db,
  ): Promise<void> {
    const { institutionId, ...record } = values;
    await db
      .insert(planApprovals)
      .values(values)
      .onConflictDoUpdate({ target: planApprovals.institutionId, set: record });
  }

  async risk(institutionId: string, id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(risks)
      .where(and(eq(risks.institutionId, institutionId), eq(risks.id, id)));
    return row;
  }

  async insertRisk(values: NewRisk, db: Db = this.db): Promise<void> {
    await db.insert(risks).values(values);
  }

  async updateRisk(
    id: string,
    changes: Partial<NewRisk>,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(risks).set(changes).where(eq(risks.id, id));
  }

  async deleteRisk(id: string, db: Db = this.db): Promise<void> {
    await db.delete(risks).where(eq(risks.id, id));
  }

  async riskInUse(riskId: string, db: Db = this.db): Promise<boolean> {
    const [used] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(eq(activities.riskId, riskId));
    return Boolean(used);
  }

  async activity(institutionId: string, id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(activities)
      .where(
        and(eq(activities.institutionId, institutionId), eq(activities.id, id)),
      );
    return row;
  }

  async insertActivity(values: NewActivity, db: Db = this.db): Promise<void> {
    await db.insert(activities).values(values);
  }

  async updateActivity(
    id: string,
    changes: Partial<NewActivity>,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(activities).set(changes).where(eq(activities.id, id));
  }

  async deleteActivity(id: string, db: Db = this.db): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }

  async activityHasPlannedMilestones(
    activityId: string,
    db: Db = this.db,
  ): Promise<boolean> {
    const [planned] = await db
      .select({ id: plannedMilestones.id })
      .from(plannedMilestones)
      .where(eq(plannedMilestones.activityId, activityId));
    return Boolean(planned);
  }

  async milestone(institutionId: string, id: string, db: Db = this.db) {
    const [row] = await db
      .select()
      .from(plannedMilestones)
      .where(
        and(
          eq(plannedMilestones.institutionId, institutionId),
          eq(plannedMilestones.id, id),
        ),
      );
    return row;
  }

  async insertMilestone(
    values: NewPlannedMilestone,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(plannedMilestones).values(values);
  }

  async updateMilestone(
    id: string,
    changes: Partial<NewPlannedMilestone>,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(plannedMilestones)
      .set(changes)
      .where(eq(plannedMilestones.id, id));
  }

  async deleteMilestone(id: string, db: Db = this.db): Promise<void> {
    await db.delete(plannedMilestones).where(eq(plannedMilestones.id, id));
  }
}
