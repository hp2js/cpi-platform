import { and, eq, inArray, lt } from 'drizzle-orm';
import { daysLate, type Obligation, type ObligationFlag } from '@cpi/contracts';
import type { Database } from '../database/fixtures';
import { clarifications, obligations, periods } from '../database/schema';
import { currentState } from '../database/state';

type ObligationRow = typeof obligations.$inferSelect;

/** Flags are derived from business time on the server, never in the browser (FR02). */
export async function toObligations(
  db: Database,
  rows: ObligationRow[],
): Promise<Obligation[]> {
  if (rows.length === 0) return [];
  const { state } = await currentState(db);
  const now = Date.parse(state.businessTime);
  const periodById = new Map(
    (await db.select().from(periods)).map((period) => [period.id, period]),
  );
  const overdue = new Set(
    (
      await db
        .select({ obligationId: clarifications.obligationId })
        .from(clarifications)
        .where(
          and(
            inArray(
              clarifications.obligationId,
              rows.map((row) => row.id),
            ),
            eq(clarifications.status, 'open'),
            lt(clarifications.responseDueAt, state.businessTime),
          ),
        )
    ).map((row) => row.obligationId),
  );
  return rows.map((row) => {
    const period = periodById.get(row.periodId);
    if (!period) throw new Error(`Unknown period ${row.periodId}`);
    const periodEnd = Date.parse(`${period.endsOn}T23:59:59+03:00`);
    const deadline = Date.parse(period.submissionDeadline);
    const flags: ObligationFlag[] = [];
    if (now <= periodEnd) flags.push('not_yet_due');
    const submittedAt = row.firstSubmittedAt
      ? Date.parse(row.firstSubmittedAt)
      : undefined;
    // A closed quarter has a disposition, not a lateness flag.
    if (
      row.state !== 'closed_without_submission' &&
      (submittedAt !== undefined ? submittedAt > deadline : now > deadline)
    )
      flags.push('late');
    if (overdue.has(row.id)) flags.push('clarification_overdue');
    return {
      ...row,
      flags,
      daysLate: row.firstSubmittedAt
        ? daysLate(row.firstSubmittedAt, period.submissionDeadline)
        : null,
    };
  });
}
