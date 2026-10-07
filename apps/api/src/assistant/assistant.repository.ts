import { Inject, Injectable } from '@nestjs/common';
import { asc, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  assistantRuns,
  assistantSuggestions,
  obligations,
  submissions,
  systemState,
} from '../database/schema';

export type RunRow = typeof assistantRuns.$inferSelect;
export type SuggestionRow = typeof assistantSuggestions.$inferSelect;

@Injectable()
export class AssistantRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** The institution a submission belongs to. */
  async submissionInstitution(
    submissionId: string,
    db: Db = this.db,
  ): Promise<string | undefined> {
    const [row] = await db
      .select({ institutionId: obligations.institutionId })
      .from(submissions)
      .innerJoin(obligations, eq(obligations.id, submissions.obligationId))
      .where(eq(submissions.id, submissionId));
    return row?.institutionId;
  }

  async enabled(db: Db = this.db): Promise<boolean> {
    const [row] = await db
      .select({ enabled: systemState.assistantEnabled })
      .from(systemState);
    return row?.enabled ?? false;
  }

  async setEnabled(enabled: boolean, db: Db = this.db): Promise<void> {
    await db.update(systemState).set({ assistantEnabled: enabled });
  }

  /** Runs for these file versions, newest first, with their suggestions in order. */
  async runs(evidenceIds: string[], db: Db = this.db) {
    if (!evidenceIds.length) return [];
    const runs = await db
      .select()
      .from(assistantRuns)
      .where(inArray(assistantRuns.evidenceId, evidenceIds))
      .orderBy(desc(assistantRuns.seq));
    const suggestions = runs.length
      ? await db
          .select()
          .from(assistantSuggestions)
          .where(
            inArray(
              assistantSuggestions.runId,
              runs.map((run) => run.id),
            ),
          )
          .orderBy(asc(assistantSuggestions.seq))
      : [];
    return runs.map((run) => ({
      run,
      suggestions: suggestions.filter((row) => row.runId === run.id),
    }));
  }

  async run(id: string, db: Db = this.db): Promise<RunRow | undefined> {
    const [row] = await db
      .select()
      .from(assistantRuns)
      .where(eq(assistantRuns.id, id));
    return row;
  }

  async insertRun(
    values: typeof assistantRuns.$inferInsert,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(assistantRuns).values(values);
  }

  async updateRun(
    id: string,
    changes: Partial<typeof assistantRuns.$inferInsert>,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(assistantRuns).set(changes).where(eq(assistantRuns.id, id));
  }

  async insertSuggestions(
    values: (typeof assistantSuggestions.$inferInsert)[],
    db: Db = this.db,
  ): Promise<void> {
    if (values.length) await db.insert(assistantSuggestions).values(values);
  }

  async suggestion(
    id: string,
    db: Db = this.db,
  ): Promise<{ suggestion: SuggestionRow; run: RunRow } | undefined> {
    const [row] = await db
      .select({ suggestion: assistantSuggestions, run: assistantRuns })
      .from(assistantSuggestions)
      .innerJoin(
        assistantRuns,
        eq(assistantRuns.id, assistantSuggestions.runId),
      )
      .where(eq(assistantSuggestions.id, id));
    return row;
  }

  async decide(
    id: string,
    decision: NonNullable<SuggestionRow['decision']>,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(assistantSuggestions)
      .set({ decision })
      .where(eq(assistantSuggestions.id, id));
  }

  /** Counts for the administrator's usage view. */
  async usage(db: Db = this.db) {
    const runs = await db
      .select({ status: assistantRuns.status, n: count() })
      .from(assistantRuns)
      .groupBy(assistantRuns.status);
    const [discarded] = await db
      .select({
        n: sql<number>`coalesce(sum((${assistantRuns.discarded}->>'untraceable')::int), 0)::int`,
      })
      .from(assistantRuns);
    const decisions = await db
      .select({
        outcome: sql<string>`${assistantSuggestions.decision}->>'outcome'`,
        n: count(),
      })
      .from(assistantSuggestions)
      .where(isNotNull(assistantSuggestions.decision))
      .groupBy(sql`${assistantSuggestions.decision}->>'outcome'`);
    const [suggestions] = await db
      .select({ n: count() })
      .from(assistantSuggestions);
    const status = Object.fromEntries(runs.map((row) => [row.status, row.n]));
    const outcome = Object.fromEntries(
      decisions.map((row) => [row.outcome, row.n]),
    );
    return {
      runs: runs.reduce((sum, row) => sum + row.n, 0),
      completed: status.completed ?? 0,
      failed: status.failed ?? 0,
      declined: status.declined ?? 0,
      suggestions: suggestions?.n ?? 0,
      accepted: outcome.accepted ?? 0,
      amended: outcome.amended ?? 0,
      dismissed: outcome.dismissed ?? 0,
      discarded: discarded?.n ?? 0,
    };
  }
}
