import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { endOfDay, type Assignment } from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { nextId, type Db, type Tx } from '../database/db';
import { assignments, users } from '../database/schema';
import { institutionUsers, usersWithRole, type Events } from '../events/events';

/*
 * Officer assignments, temporary cover and handover notes (FR01, AT22, PRD §5.2), ported from
 * the mock API's services/assignments.ts.
 */

type AssignmentRow = typeof assignments.$inferSelect;

async function names(db: Db) {
  const rows = await db
    .select({ id: users.id, name: users.displayName })
    .from(users);
  const byId = new Map(rows.map((row) => [row.id, row.name]));
  return (id: string) => byId.get(id) ?? id;
}

/** Assignment records as the API returns them, names resolved at read time. */
export async function toAssignments(
  db: Db,
  rows: AssignmentRow[],
): Promise<(Assignment & { reason: string | null })[]> {
  const nameOf = await names(db);
  return rows.map((record) => ({
    institutionId: record.institutionId as Assignment['institutionId'],
    officerId: record.officerId,
    officerName: nameOf(record.officerId),
    validFrom: record.validFrom,
    validTo: record.validTo,
    reason: record.reason,
    cover: record.cover
      ? {
          until: record.cover.until,
          returnToOfficerId: record.cover.returnToOfficerId,
          returnToOfficerName: nameOf(record.cover.returnToOfficerId),
        }
      : null,
    handoverNote: record.handoverNote,
  }));
}

export async function currentAssignment(db: Db, institutionId: string) {
  const [row] = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.institutionId, institutionId),
        isNull(assignments.validTo),
      ),
    );
  return row;
}

/**
 * Moves an institution to another officer; access follows at once and history keeps earlier
 * reviewers (FR01, AT22). With `coverUntil` (a local date) the move is temporary cover and
 * reverts at the end of that day. Call inside `write()`.
 */
export async function reassignInstitution(
  tx: Tx,
  events: Events,
  at: string,
  input: {
    institutionId: string;
    officer: User;
    reason: string;
    actor: User;
    coverUntil?: string;
    handoverNote?: string;
  },
) {
  const nameOf = await names(tx);
  // None when the institution was created without a reviewing officer: this is the first.
  const current = await currentAssignment(tx, input.institutionId);
  const [previous] = current
    ? await tx.select().from(users).where(eq(users.id, current.officerId))
    : [];
  if (current)
    await tx
      .update(assignments)
      .set({ validTo: at })
      .where(eq(assignments.id, current.id));
  const cover =
    current && input.coverUntil
      ? {
          until: endOfDay(input.coverUntil),
          // Cover of cover still returns to the officer who is away.
          returnToOfficerId:
            current.cover?.returnToOfficerId ?? current.officerId,
          setById: input.actor.id,
        }
      : null;
  const note = input.handoverNote?.trim() || null;
  await tx.insert(assignments).values({
    institutionId: input.institutionId,
    officerId: input.officer.id,
    validFrom: at,
    validTo: null,
    reason: input.reason,
    cover,
    handoverNote: note,
  });
  await events.audit(
    tx,
    at,
    input.actor,
    cover ? 'assignment.cover' : 'assignment.change',
    { type: 'assignment', id: input.institutionId },
    `${input.institutionId} → ${input.officer.displayName}${cover ? ` (cover until ${cover.until.slice(0, 10)})` : ''}: ${input.reason}`,
  );
  const key = await nextId(tx, `${input.institutionId}:assigned`);
  await events.notify(tx, at, key, 'assignment.changed', [input.officer], {
    title: cover
      ? `You are covering ${input.institutionId} until ${cover.until.slice(0, 10)}`
      : `${input.institutionId} assigned to you`,
    body: [
      cover
        ? `You review ${input.institutionId} while ${nameOf(cover.returnToOfficerId)} is away; it returns to them automatically.`
        : 'You are now the reviewing officer for this institution. Earlier reviewers remain in the history.',
      note && `Handover note: ${note}`,
    ]
      .filter(Boolean)
      .join(' '),
    link: `/officer/institutions/${input.institutionId}`,
  });
  if (previous?.active && previous.id !== input.officer.id)
    await events.notify(
      tx,
      at,
      `${key}:previous`,
      'assignment.changed',
      [previous],
      {
        title: `${input.institutionId} moved to ${input.officer.displayName}`,
        body: cover
          ? `${input.officer.displayName} covers it until ${cover.until.slice(0, 10)}; it then returns to ${nameOf(cover.returnToOfficerId)}.`
          : 'You no longer review this institution. Your recorded decisions keep your name.',
        link: null,
      },
    );
  await events.notify(
    tx,
    at,
    `${key}:institution`,
    'assignment.changed',
    await institutionUsers(tx, input.institutionId),
    {
      title: 'Your reviewing officer has changed',
      body: cover
        ? `${input.officer.displayName} reviews your reports until ${cover.until.slice(0, 10)}.`
        : `${input.officer.displayName} now reviews your reports.`,
      link: null,
    },
  );
}

/**
 * Returns institutions whose cover has ended to the officer who was away. If that officer is no
 * longer active, the cover officer keeps the institution and administrators are told.
 */
export async function endExpiredCover(
  tx: Tx,
  events: Events,
  businessTime: string,
) {
  const expired = await tx
    .select()
    .from(assignments)
    .where(
      and(
        isNull(assignments.validTo),
        isNotNull(assignments.cover),
        // The cover end is stored in jsonb; compare it as an instant.
        sql`(${assignments.cover} ->> 'until')::timestamptz <= ${businessTime}`,
      ),
    )
    .orderBy(asc(assignments.institutionId));
  const nameOf = await names(tx);
  for (const record of expired) {
    const cover = record.cover!;
    const [actor] = await tx
      .select()
      .from(users)
      .where(eq(users.id, cover.setById));
    const [returning] = await tx
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, cover.returnToOfficerId),
          eq(users.role, 'officer'),
          eq(users.active, true),
        ),
      );
    if (!returning) {
      await tx
        .update(assignments)
        .set({ cover: null })
        .where(eq(assignments.id, record.id));
      await events.notify(
        tx,
        businessTime,
        `${record.institutionId}:cover-orphaned:${cover.until}`,
        'assignment.cover_ended',
        await usersWithRole(tx, 'administrator'),
        {
          title: `Cover ended for ${record.institutionId}`,
          body: `${nameOf(cover.returnToOfficerId)} is no longer active, so ${nameOf(record.officerId)} keeps the institution. Reassign it if needed.`,
          link: '/admin/assignments',
        },
      );
      continue;
    }
    await reassignInstitution(tx, events, cover.until, {
      institutionId: record.institutionId,
      officer: returning,
      reason: `Cover by ${nameOf(record.officerId)} ended`,
      actor: actor!,
    });
  }
}
