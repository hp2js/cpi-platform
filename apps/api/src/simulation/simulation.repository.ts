import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  cycles,
  formVersions,
  processedEvents,
  scoringProfiles,
} from '../database/schema';

type ProfileRow = typeof scoringProfiles.$inferSelect;

@Injectable()
export class SimulationRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async processedEventCount(runId: string, db: Db = this.db): Promise<number> {
    const [processed] = await db
      .select({ count: count() })
      .from(processedEvents)
      .where(eq(processedEvents.runId, runId));
    return processed?.count ?? 0;
  }

  async profile(id: string): Promise<ProfileRow | undefined> {
    const [profile] = await this.db
      .select()
      .from(scoringProfiles)
      .where(eq(scoringProfiles.id, id));
    return profile;
  }

  /** The run's single cycle and every form version take the chosen profile's weights. */
  async applyProfile(profile: ProfileRow, db: Db = this.db): Promise<void> {
    await db.update(cycles).set({ profileId: profile.id });
    await db.update(formVersions).set({ weights: { ...profile.weights } });
  }
}
