import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Draft } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import {
  clarifications,
  decisions,
  drafts,
  obligations,
  oversightComments,
  reopenings,
  submissions,
  suitability,
} from '../database/schema';

type Obligation = typeof obligations.$inferSelect;
type NewDecision = typeof decisions.$inferInsert;
type NewSuitability = typeof suitability.$inferInsert;
type NewComment = typeof oversightComments.$inferInsert;
type CommentUpdate = Partial<NewComment>;
type NewClarification = typeof clarifications.$inferInsert;
type SubmissionUpdate = Partial<typeof submissions.$inferInsert>;
type NewReopening = typeof reopenings.$inferInsert;
/** A draft re-created from a submission has no saver yet. */
type RevisionDraft = Omit<Draft, 'savedAt' | 'savedBy'> & {
  savedAt: string | null;
  savedBy: string | null;
};

@Injectable()
export class ReviewRepository {
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

  async setObligationState(
    id: string,
    state: Obligation['state'],
    db: Db = this.db,
  ): Promise<void> {
    await db.update(obligations).set({ state }).where(eq(obligations.id, id));
  }

  /** Supersedes the active decision for the milestone, if any, and appends the new one. */
  async replaceDecision(
    decision: NewDecision,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(decisions)
      .set({ supersededAt: decision.decidedAt })
      .where(
        and(
          eq(decisions.submissionId, decision.submissionId),
          eq(decisions.milestoneId, decision.milestoneId),
          isNull(decisions.supersededAt),
        ),
      );
    await db.insert(decisions).values(decision);
  }

  async saveSuitability(
    record: NewSuitability,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .insert(suitability)
      .values(record)
      .onConflictDoUpdate({ target: suitability.evidenceId, set: record });
  }

  async insertClarification(
    values: NewClarification,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(clarifications).values(values);
  }

  async closeClarification(
    id: string,
    closure: NonNullable<NewClarification['closure']>,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(clarifications)
      .set({ status: 'closed_unanswered', closure })
      .where(eq(clarifications.id, id));
  }

  async saveDraft(draft: RevisionDraft, db: Db = this.db): Promise<void> {
    await db
      .insert(drafts)
      .values(draft)
      .onConflictDoUpdate({ target: drafts.obligationId, set: draft });
  }

  async insertComment(values: NewComment, db: Db = this.db): Promise<void> {
    await db.insert(oversightComments).values(values);
  }

  async updateComment(
    id: string,
    changes: CommentUpdate,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(oversightComments)
      .set(changes)
      .where(eq(oversightComments.id, id));
  }

  async updateSubmission(
    id: string,
    changes: SubmissionUpdate,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(submissions).set(changes).where(eq(submissions.id, id));
  }

  async insertReopening(values: NewReopening, db: Db = this.db): Promise<void> {
    await db.insert(reopenings).values(values);
  }
}
