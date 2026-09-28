import type { Assignment } from '@cpi/contracts';
import type { MockDb } from '../db';
import type { MockUser } from '../seed/cast';
import { endOfDay } from './days';
import { audit, institutionUsers, notify } from './events';

type MockAssignment = MockDb['assignments'][number];

const nameOf = (db: MockDb, userId: string) =>
  db.users.find((user) => user.id === userId)?.displayName ?? userId;

/** An assignment record as the API returns it, names resolved at read time. */
export function toAssignment(
  db: MockDb,
  record: MockAssignment,
): Assignment & { reason: string | null } {
  return {
    institutionId: record.institutionId as Assignment['institutionId'],
    officerId: record.officerId,
    officerName: nameOf(db, record.officerId),
    validFrom: record.validFrom,
    validTo: record.validTo,
    reason: record.reason,
    // `?? null`: records stored before these fields existed read as ordinary assignments.
    cover: record.cover
      ? {
          until: record.cover.until,
          returnToOfficerId: record.cover.returnToOfficerId,
          returnToOfficerName: nameOf(db, record.cover.returnToOfficerId),
        }
      : null,
    handoverNote: record.handoverNote ?? null,
  };
}

export const currentAssignment = (db: MockDb, institutionId: string) =>
  db.assignments.find(
    (assignment) =>
      assignment.institutionId === institutionId && assignment.validTo === null,
  );

/**
 * Moves an institution to another officer; access follows at once and history keeps earlier
 * reviewers (FR01, AT22). With `coverUntil` (a local date) the move is temporary cover and
 * reverts at the end of that day. Call inside `commit`.
 */
export function reassignInstitution(
  db: MockDb,
  input: {
    institutionId: string;
    officer: MockUser;
    reason: string;
    actor: MockUser;
    coverUntil?: string;
    handoverNote?: string;
    /** When the change takes effect; defaults to the current business time. */
    at?: string;
  },
) {
  const at = input.at ?? db.businessTime;
  const current = currentAssignment(db, input.institutionId)!;
  const previous = db.users.find((user) => user.id === current.officerId);
  current.validTo = at;
  const cover = input.coverUntil
    ? {
        until: endOfDay(input.coverUntil),
        // Cover of cover still returns to the officer who is away.
        returnToOfficerId:
          current.cover?.returnToOfficerId ?? current.officerId,
        setById: input.actor.id,
      }
    : null;
  const note = input.handoverNote?.trim() || null;
  db.assignments.push({
    institutionId: input.institutionId,
    officerId: input.officer.id,
    validFrom: at,
    validTo: null,
    reason: input.reason,
    cover,
    handoverNote: note,
  });
  audit(
    db,
    input.actor,
    cover ? 'assignment.cover' : 'assignment.change',
    { type: 'assignment', id: input.institutionId },
    `${input.institutionId} → ${input.officer.displayName}${cover ? ` (cover until ${cover.until.slice(0, 10)})` : ''}: ${input.reason}`,
  );
  const key = `${input.institutionId}:assigned:${db.sequence}`;
  notify(db, key, 'assignment.changed', [input.officer], {
    title: cover
      ? `You are covering ${input.institutionId} until ${cover.until.slice(0, 10)}`
      : `${input.institutionId} assigned to you`,
    body: [
      cover
        ? `You review ${input.institutionId} while ${nameOf(db, cover.returnToOfficerId)} is away; it returns to them automatically.`
        : 'You are now the reviewing officer for this institution. Earlier reviewers remain in the history.',
      note && `Handover note: ${note}`,
    ]
      .filter(Boolean)
      .join(' '),
    link: `/officer/institutions/${input.institutionId}`,
  });
  if (previous?.active && previous.id !== input.officer.id)
    notify(db, `${key}:previous`, 'assignment.changed', [previous], {
      title: `${input.institutionId} moved to ${input.officer.displayName}`,
      body: cover
        ? `${input.officer.displayName} covers it until ${cover.until.slice(0, 10)}; it then returns to ${nameOf(db, cover.returnToOfficerId)}.`
        : 'You no longer review this institution. Your recorded decisions keep your name.',
      link: null,
    });
  notify(
    db,
    `${key}:institution`,
    'assignment.changed',
    institutionUsers(input.institutionId),
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
export function endExpiredCover(db: MockDb) {
  const now = Date.parse(db.businessTime);
  for (const record of db.assignments.filter(
    (assignment) =>
      assignment.validTo === null &&
      assignment.cover !== null &&
      Date.parse(assignment.cover.until) <= now,
  )) {
    const cover = record.cover!;
    const actor = db.users.find((user) => user.id === cover.setById)!;
    const returning = db.users.find(
      (user) =>
        user.id === cover.returnToOfficerId &&
        user.role === 'officer' &&
        user.active,
    );
    if (!returning) {
      record.cover = null;
      notify(
        db,
        `${record.institutionId}:cover-orphaned:${cover.until}`,
        'assignment.cover_ended',
        db.users.filter((user) => user.role === 'administrator' && user.active),
        {
          title: `Cover ended for ${record.institutionId}`,
          body: `${nameOf(db, cover.returnToOfficerId)} is no longer active, so ${nameOf(db, record.officerId)} keeps the institution. Reassign it if needed.`,
          link: '/admin/assignments',
        },
      );
      continue;
    }
    reassignInstitution(db, {
      institutionId: record.institutionId,
      officer: returning,
      reason: `Cover by ${nameOf(db, record.officerId)} ended`,
      actor,
      at: cover.until,
    });
  }
}
