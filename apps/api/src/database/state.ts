import { asc, eq, sql } from 'drizzle-orm';
import type { Cycle, FormVersion } from '@cpi/contracts';
import type { Db } from './db';
import {
  cycles,
  formVersions,
  periods,
  scoringProfiles,
  systemState,
} from './schema';

/** The run, simulated business time, current cycle and its scoring profile (FR14, §7.1). */
export async function currentState(db: Db) {
  const [row] = await db
    .select({ state: systemState, cycle: cycles, profile: scoringProfiles })
    .from(systemState)
    // One cycle per run (the prototype's single FY2026/27 cycle).
    .innerJoin(cycles, sql`true`)
    .innerJoin(scoringProfiles, eq(scoringProfiles.id, cycles.profileId));
  if (!row) throw new Error('The database has no cycle. Run pnpm db:seed.');
  return row;
}

/** The current cycle in its contract shape, periods in quarter order. */
export async function loadCycle(db: Db): Promise<Cycle> {
  const { cycle } = await currentState(db);
  const rows = await db
    .select()
    .from(periods)
    .where(eq(periods.cycleId, cycle.id))
    .orderBy(asc(periods.quarter));
  return {
    id: cycle.id,
    label: cycle.label,
    timezone: cycle.timezone,
    foundationDeadline: cycle.foundationDeadline,
    evaluationCutoff: cycle.evaluationCutoff,
    dayCounting: cycle.dayCounting,
    riskScale: cycle.riskScale,
    periods: rows.map((period) => ({
      id: period.id,
      quarter: period.quarter,
      label: period.label,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      submissionDeadline: period.submissionDeadline,
    })),
  };
}

export function loadForms(db: Db): Promise<FormVersion[]> {
  return db.select().from(formVersions).orderBy(asc(formVersions.version));
}

export function loadProfiles(db: Db) {
  return db
    .select()
    .from(scoringProfiles)
    .orderBy(asc(scoringProfiles.position));
}
