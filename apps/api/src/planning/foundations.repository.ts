import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { FoundationKind } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import {
  evidence,
  foundationReviews,
  foundationVersions,
} from '../database/schema';

type FoundationVersionRow = typeof foundationVersions.$inferSelect;
type NewFoundationVersion = typeof foundationVersions.$inferInsert;
type NewFoundationReview = typeof foundationReviews.$inferInsert;

@Injectable()
export class FoundationsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async latestVersion(
    institutionId: string,
    kind: FoundationKind,
    db: Db = this.db,
  ): Promise<FoundationVersionRow | undefined> {
    const [previous] = await db
      .select()
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.institutionId, institutionId),
          eq(foundationVersions.kind, kind),
        ),
      )
      .orderBy(desc(foundationVersions.version))
      .limit(1);
    return previous;
  }

  async version(
    id: string,
    db: Db = this.db,
  ): Promise<FoundationVersionRow | undefined> {
    const [version] = await db
      .select()
      .from(foundationVersions)
      .where(eq(foundationVersions.id, id));
    return version;
  }

  async versionOf(
    id: string,
    institutionId: string,
    kind: FoundationKind,
    db: Db = this.db,
  ): Promise<FoundationVersionRow | undefined> {
    const [version] = await db
      .select()
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.id, id),
          eq(foundationVersions.institutionId, institutionId),
          eq(foundationVersions.kind, kind),
        ),
      );
    return version;
  }

  /** Every version of one indicator, for finding the one effective at the cutoff. */
  versionsOf(
    institutionId: string,
    kind: FoundationKind,
    db: Db = this.db,
  ): Promise<FoundationVersionRow[]> {
    return db
      .select()
      .from(foundationVersions)
      .where(
        and(
          eq(foundationVersions.institutionId, institutionId),
          eq(foundationVersions.kind, kind),
        ),
      );
  }

  async evidenceSha256(id: string, db: Db = this.db) {
    const [existing] = await db
      .select({ sha256: evidence.sha256 })
      .from(evidence)
      .where(eq(evidence.id, id));
    return existing?.sha256;
  }

  /** Supersession keeps the earlier version and its decisions; it never deletes history. */
  async supersedeActive(
    institutionId: string,
    kind: FoundationKind,
    effectiveTo: string,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(foundationVersions)
      .set({ status: 'superseded', effectiveTo })
      .where(
        and(
          eq(foundationVersions.institutionId, institutionId),
          eq(foundationVersions.kind, kind),
          eq(foundationVersions.status, 'active'),
        ),
      );
  }

  async insertVersion(
    values: NewFoundationVersion,
    db: Db = this.db,
  ): Promise<FoundationVersionRow> {
    const [version] = await db
      .insert(foundationVersions)
      .values(values)
      .returning();
    return version!;
  }

  async withdraw(id: string, reason: string, db: Db = this.db): Promise<void> {
    await db
      .update(foundationVersions)
      .set({ status: 'withdrawn', withdrawnReason: reason })
      .where(eq(foundationVersions.id, id));
  }

  async insertReview(
    values: NewFoundationReview,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(foundationReviews).values(values);
  }
}
