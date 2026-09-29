import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';
import { systemState } from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Either the pool or an open transaction. */
export type Db = Database | Tx;

/**
 * Run a change in a transaction that holds the single write lock (the system_state row), so
 * workflow transitions never interleave and every write sees the business time it records.
 * ponytail: one global writer is plenty for 8 institutions; move to per-obligation row locks
 * (SELECT … FOR UPDATE on the obligation) if write throughput ever matters.
 */
export function write<T>(
  db: Database,
  change: (tx: Tx, businessTime: string) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [state] = await tx
      .select({ businessTime: systemState.businessTime })
      .from(systemState)
      .for('update');
    if (!state) throw new Error('The database has no run. Run pnpm db:seed.');
    return change(tx, state.businessTime);
  });
}

/** Readable record IDs (`audit-0042`), like the mock's monotonic counter. */
export async function nextId(db: Db, prefix: string) {
  const result = await db.execute<{ id: string }>(
    sql`SELECT nextval('record_ids')::text AS id`,
  );
  return `${prefix}-${result.rows[0]!.id.padStart(4, '0')}`;
}
