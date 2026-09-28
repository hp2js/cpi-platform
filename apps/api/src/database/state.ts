import { eq, sql } from 'drizzle-orm';
import type { Database } from './fixtures';
import { cycles, scoringProfiles, systemState } from './schema';

/** The run, simulated business time, current cycle and its scoring profile (FR14, §7.1). */
export async function currentState(db: Database) {
  const [row] = await db
    .select({ state: systemState, cycle: cycles, profile: scoringProfiles })
    .from(systemState)
    // One cycle per run (the prototype's single FY2026/27 cycle).
    .innerJoin(cycles, sql`true`)
    .innerJoin(scoringProfiles, eq(scoringProfiles.id, cycles.profileId));
  if (!row) throw new Error('The database has no cycle. Run pnpm db:seed.');
  return row;
}
