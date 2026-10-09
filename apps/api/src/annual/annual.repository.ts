import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Database, type Db } from '../database/db';
import {
  archivedPublications,
  closedYears,
  closures,
  corrections,
  extensions,
  obligations,
  publications,
} from '../database/schema';

type NewPublication = typeof publications.$inferInsert;
type NewExtension = typeof extensions.$inferInsert;
type NewCorrection = typeof corrections.$inferInsert;
type NewClosure = typeof closures.$inferInsert;

@Injectable()
export class AnnualRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** A closed year's release (HP2-100), with the year's name. */
  async archived(id: string, db: Db = this.db) {
    const [row] = await db
      .select({
        publication: archivedPublications,
        yearLabel: closedYears.label,
      })
      .from(archivedPublications)
      .innerJoin(closedYears, eq(closedYears.id, archivedPublications.yearId))
      .where(eq(archivedPublications.id, id));
    return row;
  }

  /** Records a release; the earlier one stays accessible as superseded (§7.4, AT20). */
  async publish(
    values: NewPublication,
    previousId: string | undefined,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(publications).values(values);
    if (previousId)
      await db
        .update(publications)
        .set({ supersededBy: values.id })
        .where(eq(publications.id, previousId));
  }

  async closeCorrection(
    id: string,
    closedAt: string,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(corrections)
      .set({ closedAt })
      .where(eq(corrections.id, id));
  }

  /** One current extension per institution; the audit log keeps earlier ones. */
  async replaceExtension(
    values: NewExtension,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .delete(extensions)
      .where(eq(extensions.institutionId, values.institutionId));
    await db.insert(extensions).values(values);
  }

  async hasCurrentPublication(
    institutionId: string,
    db: Db = this.db,
  ): Promise<boolean> {
    const [current] = await db
      .select({ id: publications.id })
      .from(publications)
      .where(
        and(
          eq(publications.institutionId, institutionId),
          isNull(publications.supersededBy),
        ),
      );
    return Boolean(current);
  }

  async hasOpenCorrection(
    institutionId: string,
    db: Db = this.db,
  ): Promise<boolean> {
    const [open] = await db
      .select({ id: corrections.id })
      .from(corrections)
      .where(
        and(
          eq(corrections.institutionId, institutionId),
          isNull(corrections.closedAt),
        ),
      );
    return Boolean(open);
  }

  async insertCorrection(
    values: NewCorrection,
    db: Db = this.db,
  ): Promise<void> {
    await db.insert(corrections).values(values);
  }

  async closeWithoutSubmission(
    closure: NewClosure,
    db: Db = this.db,
  ): Promise<void> {
    await db
      .update(obligations)
      .set({ state: 'closed_without_submission' })
      .where(eq(obligations.id, closure.obligationId));
    await db.insert(closures).values(closure);
  }
}
