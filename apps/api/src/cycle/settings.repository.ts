import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  calendarChanges,
  cycles,
  formVersions,
  periods,
  processedEvents,
  riskScaleChanges,
  scoringProfiles,
} from '../database/schema';

export type ProfileRow = typeof scoringProfiles.$inferSelect;
type NewProfile = typeof scoringProfiles.$inferInsert;
type CycleUpdate = Partial<typeof cycles.$inferInsert>;
type NewChange = typeof calendarChanges.$inferInsert;
type ProcessedEvent = typeof processedEvents.$inferInsert;

/** Scoring profiles, the reporting calendar and the risk scale (PRD §7.1, FR02). */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Risk scale changes, newest first. */
  riskScaleChanges(db: Db = this.db) {
    return db
      .select({
        at: riskScaleChanges.at,
        by: riskScaleChanges.by,
        summary: riskScaleChanges.summary,
        reason: riskScaleChanges.reason,
      })
      .from(riskScaleChanges)
      .orderBy(desc(riskScaleChanges.id));
  }

  async insertRiskScaleChange(values: NewChange, db: Db = this.db) {
    await db.insert(riskScaleChanges).values(values);
  }

  /** Calendar changes, newest first. */
  calendarChanges(db: Db = this.db) {
    return db
      .select({
        at: calendarChanges.at,
        by: calendarChanges.by,
        summary: calendarChanges.summary,
        reason: calendarChanges.reason,
      })
      .from(calendarChanges)
      .orderBy(desc(calendarChanges.id));
  }

  async insertCalendarChange(values: NewChange, db: Db = this.db) {
    const [change] = await db
      .insert(calendarChanges)
      .values(values)
      .returning({ id: calendarChanges.id });
    return change!.id;
  }

  async profile(id: string, db: Db = this.db): Promise<ProfileRow | undefined> {
    const [profile] = await db
      .select()
      .from(scoringProfiles)
      .where(eq(scoringProfiles.id, id));
    return profile;
  }

  async insertProfile(values: NewProfile, db: Db = this.db) {
    const [created] = await db
      .insert(scoringProfiles)
      .values(values)
      .returning();
    return created!;
  }

  async updateProfile(
    id: string,
    changes: Partial<NewProfile>,
    db: Db = this.db,
  ): Promise<ProfileRow | undefined> {
    const [updated] = await db
      .update(scoringProfiles)
      .set(changes)
      .where(eq(scoringProfiles.id, id))
      .returning();
    return updated;
  }

  async deleteProfile(id: string, db: Db = this.db) {
    await db.delete(scoringProfiles).where(eq(scoringProfiles.id, id));
  }

  /** Applies the profile to the cycle; draft form versions show its weights as a snapshot. */
  async applyProfile(cycleId: string, profile: ProfileRow, db: Db = this.db) {
    await db
      .update(cycles)
      .set({ profileId: profile.id })
      .where(eq(cycles.id, cycleId));
    await db
      .update(formVersions)
      .set({ weights: profile.weights })
      .where(eq(formVersions.status, 'draft'));
  }

  async updateCycle(id: string, changes: CycleUpdate, db: Db = this.db) {
    await db.update(cycles).set(changes).where(eq(cycles.id, id));
  }

  async setPeriodDeadline(id: string, deadline: string, db: Db = this.db) {
    await db
      .update(periods)
      .set({ submissionDeadline: deadline })
      .where(eq(periods.id, id));
  }

  async markProcessed(events: ProcessedEvent[], db: Db = this.db) {
    await db.insert(processedEvents).values(events).onConflictDoNothing();
  }
}
