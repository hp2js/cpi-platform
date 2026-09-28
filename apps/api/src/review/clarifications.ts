import { asc, eq } from 'drizzle-orm';
import type { Clarification } from '@cpi/contracts';
import type { Db } from '../database/db';
import { clarifications, extensions, periods } from '../database/schema';
import { currentState } from '../database/state';

type Row = typeof clarifications.$inferSelect;

/** The cutoff that applies to an institution: the cycle's, or an authorized extension (§7.3). */
export async function effectiveCutoff(db: Db, institutionId: string) {
  const [{ cycle }, granted] = await Promise.all([
    currentState(db),
    db
      .select({ until: extensions.until })
      .from(extensions)
      .where(eq(extensions.institutionId, institutionId)),
  ]);
  return Math.max(
    Date.parse(cycle.evaluationCutoff),
    ...granted.map((extension) => Date.parse(extension.until)),
  );
}

/** Adds the derived flags: overdue, and whether the window needs an extension decision. */
export async function toClarifications(
  db: Db,
  rows: Row[],
): Promise<Clarification[]> {
  if (rows.length === 0) return [];
  const [{ state, cycle }, periodRows] = await Promise.all([
    currentState(db),
    db.select().from(periods),
  ]);
  const now = Date.parse(state.businessTime);
  const cycleCutoff = Date.parse(cycle.evaluationCutoff);
  const cutoffs = new Map<string, number>();
  for (const institutionId of new Set(rows.map((row) => row.institutionId)))
    cutoffs.set(institutionId, await effectiveCutoff(db, institutionId));
  return rows.map((row) => {
    const due = Date.parse(row.responseDueAt);
    return {
      id: row.id,
      submissionId: row.submissionId,
      obligationId: row.obligationId,
      institutionId: row.institutionId,
      periodId: row.periodId,
      periodLabel:
        periodRows.find((period) => period.id === row.periodId)?.label ?? '',
      revision: row.revision,
      items: row.items,
      requestedBy: row.requestedBy,
      requestedAt: row.requestedAt,
      availableAt: row.availableAt,
      notifiedAt: row.notifiedAt,
      responseDueAt: row.responseDueAt,
      status: row.status,
      overdue: row.status === 'open' && now > due,
      // Never shortened automatically: an authorized extension or a pending result is required.
      extensionRequired:
        row.status === 'open' &&
        due > cycleCutoff &&
        due > cutoffs.get(row.institutionId)!,
      response: row.response,
      closure: row.closure,
    };
  });
}

export async function clarificationsFor(db: Db, obligationId: string) {
  return toClarifications(
    db,
    await db
      .select()
      .from(clarifications)
      .where(eq(clarifications.obligationId, obligationId))
      .orderBy(asc(clarifications.requestedAt), asc(clarifications.id)),
  );
}
