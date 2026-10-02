import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';
import { systemState } from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Work that must happen only once the transaction has committed (e.g. sending email). */
export type AfterCommit = (task: () => Promise<void>) => void;
/** Either the pool or an open transaction. */
export type Db = Database | Tx;

/**
 * Run a change in a transaction that holds the single write lock (the system_state row), so
 * workflow transitions never interleave and every write sees the business time it records.
 * Tasks registered with `afterCommit` run once the transaction commits, outside the lock.
 * ponytail: one global writer is plenty for 8 institutions; move to per-obligation row locks
 * (SELECT … FOR UPDATE on the obligation) if write throughput ever matters.
 */
export async function write<T>(
  db: Database,
  change: (
    tx: Tx,
    businessTime: string,
    afterCommit: AfterCommit,
  ) => Promise<T>,
): Promise<T> {
  const after: (() => Promise<void>)[] = [];
  const result = await db.transaction(async (tx) => {
    const [state] = await tx
      .select({ businessTime: systemState.businessTime })
      .from(systemState)
      .for('update');
    if (!state) throw new Error('The database has no run. Run pnpm db:seed.');
    return change(tx, state.businessTime, (task) => after.push(task));
  });
  // Every task runs even if one fails; the first failure is reported after all have run.
  const failures = (
    await Promise.allSettled(after.map((task) => task()))
  ).filter((outcome) => outcome.status === 'rejected');
  if (failures.length) throw failures[0]!.reason;
  return result;
}

/** Readable record IDs (`audit-0042`), like the mock's monotonic counter. */
export async function nextId(db: Db, prefix: string) {
  const result = await db.execute<{ id: string }>(
    sql`SELECT nextval('record_ids')::text AS id`,
  );
  return `${prefix}-${result.rows[0]!.id.padStart(4, '0')}`;
}
