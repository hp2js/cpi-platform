import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Receipt } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import {
  auditEvents,
  clarifications,
  drafts,
  evidence,
  foundationVersions,
  idempotencyKeys,
  institutions,
  obligations,
  receipts,
  submissions,
} from '../database/schema';

export type EvidenceRow = typeof evidence.$inferSelect;
type NewEvidence = typeof evidence.$inferInsert;
type NewDraft = typeof drafts.$inferInsert;
type NewSubmission = typeof submissions.$inferInsert;
type ObligationUpdate = Partial<typeof obligations.$inferInsert>;

@Injectable()
export class ReportingRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async saveDraft(draft: NewDraft, db: Db = this.db): Promise<void> {
    await db
      .insert(drafts)
      .values(draft)
      .onConflictDoUpdate({ target: drafts.obligationId, set: draft });
  }

  async updateObligation(
    id: string,
    changes: ObligationUpdate,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(obligations).set(changes).where(eq(obligations.id, id));
  }

  async insertEvidence(
    values: NewEvidence,
    db: Db = this.db,
  ): Promise<EvidenceRow> {
    const [item] = await db.insert(evidence).values(values).returning();
    return item!;
  }

  async supersedeEvidence(
    id: string,
    supersededBy: string,
    db: Db = this.db,
  ): Promise<void> {
    await db.update(evidence).set({ supersededBy }).where(eq(evidence.id, id));
  }

  async evidence(id: string): Promise<EvidenceRow | undefined> {
    const [item] = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.id, id));
    return item;
  }

  /** Whether the file is part of a submission or a foundation document. */
  async isSubmittedOrFoundation(evidenceId: string): Promise<boolean> {
    const [[submitted], [foundation]] = await Promise.all([
      this.db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          sql`${submissions.evidenceIds} @> ${JSON.stringify([evidenceId])}::jsonb`,
        )
        .limit(1),
      this.db
        .select({ id: foundationVersions.id })
        .from(foundationVersions)
        .where(eq(foundationVersions.evidenceId, evidenceId))
        .limit(1),
    ]);
    return Boolean(submitted || foundation);
  }

  /** Whether this administrator opened a support view of the obligation since `since`. */
  async hasSupportView(
    obligationId: string,
    actorName: string,
    since: string,
  ): Promise<boolean> {
    const [support] = await this.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.action, 'support.draft_view'),
          eq(auditEvents.objectId, obligationId),
          eq(auditEvents.actorName, actorName),
          eq(auditEvents.actorRole, 'administrator'),
          gt(auditEvents.actualTime, since),
        ),
      )
      .limit(1);
    return Boolean(support);
  }

  /** The receipt recorded under this user's idempotency key, if any. */
  async receiptForKey(
    userId: string,
    key: string,
    db: Db = this.db,
  ): Promise<Receipt | undefined> {
    const [replay] = await db
      .select({ receipt: receipts.receipt })
      .from(idempotencyKeys)
      .innerJoin(receipts, eq(receipts.id, idempotencyKeys.receiptId))
      .where(
        and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key)),
      );
    return replay?.receipt;
  }

  async institutionName(id: string, db: Db = this.db) {
    const [institution] = await db
      .select({ name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, id));
    return institution?.name;
  }

  /**
   * Receipt, revision, idempotency record, draft removal, answered clarifications and the
   * obligation's new state; call inside the submission's transaction (FR07).
   */
  async recordSubmission(
    input: {
      receipt: Receipt;
      submission: NewSubmission;
      userId: string;
      key: string;
      obligation: ObligationUpdate;
    },
    db: Db,
  ): Promise<void> {
    const { receipt, submission } = input;
    await db.insert(receipts).values({
      id: receipt.id,
      obligationId: receipt.obligationId,
      institutionId: receipt.institutionId,
      receipt,
    });
    await db.insert(submissions).values(submission);
    await db
      .insert(idempotencyKeys)
      .values({ userId: input.userId, key: input.key, receiptId: receipt.id });
    await db
      .delete(drafts)
      .where(eq(drafts.obligationId, receipt.obligationId));
    await db
      .update(clarifications)
      .set({
        status: 'responded',
        response: {
          revision: submission.revision,
          submittedAt: receipt.receivedAt,
        },
      })
      .where(
        and(
          eq(clarifications.obligationId, receipt.obligationId),
          eq(clarifications.status, 'open'),
        ),
      );
    await this.updateObligation(receipt.obligationId, input.obligation, db);
  }

  async receipts(institutionId: string): Promise<Receipt[]> {
    const rows = await this.db
      .select({ receipt: receipts.receipt })
      .from(receipts)
      .where(eq(receipts.institutionId, institutionId))
      .orderBy(desc(receipts.seq));
    return rows.map((row) => row.receipt);
  }

  async receipt(id: string) {
    const [row] = await this.db
      .select()
      .from(receipts)
      .where(eq(receipts.id, id));
    return row;
  }
}
