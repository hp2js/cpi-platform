import { Inject, Injectable } from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import type { AuditEvent } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import {
  assignments,
  auditEvents,
  deliveries,
  formVersions,
  institutions,
  obligations,
  publications,
  suggestions,
  supervisions,
  users,
} from '../database/schema';

@Injectable()
export class AdminRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** The whole audit log, newest first. */
  async auditEvents(): Promise<AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .orderBy(sql`${auditEvents.seq} DESC`);
    return rows.map(({ seq, ...event }) => event);
  }

  /** Everything the attention list counts. Rows stay internal; only counts reach the client. */
  attentionRows() {
    const db = this.db;
    return Promise.all([
      db.select().from(deliveries).where(eq(deliveries.status, 'failed')),
      db.select().from(suggestions).where(eq(suggestions.status, 'open')),
      db.select().from(institutions).where(eq(institutions.active, true)),
      db.select().from(users),
      db.select().from(assignments).where(isNull(assignments.validTo)),
      db.select().from(supervisions).where(isNull(supervisions.validTo)),
      db
        .select({ id: formVersions.id })
        .from(formVersions)
        .where(eq(formVersions.status, 'published')),
    ]);
  }

  /** Institutions with a current (not superseded) publication. */
  currentPublications() {
    return this.db
      .select({ institutionId: publications.institutionId })
      .from(publications)
      .where(isNull(publications.supersededBy));
  }

  async obligation(id: string, db: Db = this.db) {
    const [obligation] = await db
      .select()
      .from(obligations)
      .where(eq(obligations.id, id));
    return obligation;
  }
}
