import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../database/db';
import { assignments, institutions, supervisions } from '../database/schema';
import type { User } from './sessions';

/** Current assignment only: reassignment removes access immediately (PRD §5.2). */
export async function assignedInstitutionIds(db: Db, officerId: string) {
  const rows = await db
    .select({ id: assignments.institutionId })
    .from(assignments)
    .where(
      and(eq(assignments.officerId, officerId), isNull(assignments.validTo)),
    )
    .orderBy(asc(assignments.institutionId));
  return rows.map((row) => row.id);
}

/** Current supervision only: a supervisor sees the institutions assigned to them (PRD §5.2). */
export async function supervisedInstitutionIds(db: Db, supervisorId: string) {
  const rows = await db
    .select({ id: supervisions.institutionId })
    .from(supervisions)
    .where(
      and(
        eq(supervisions.supervisorId, supervisorId),
        isNull(supervisions.validTo),
      ),
    )
    .orderBy(asc(supervisions.institutionId));
  return rows.map((row) => row.id);
}

/** Institutions whose records the caller may read (the blueprint's access-when rules). */
export async function readableInstitutionIds(
  db: Db,
  user: User,
): Promise<string[]> {
  switch (user.role) {
    case 'institution':
      return user.institutionId ? [user.institutionId] : [];
    case 'officer':
      return assignedInstitutionIds(db, user.id);
    case 'supervisor':
      return supervisedInstitutionIds(db, user.id);
    case 'administrator':
      return (
        await db
          .select({ id: institutions.id })
          .from(institutions)
          .orderBy(asc(institutions.id))
      ).map((row) => row.id);
  }
}

export async function canReadInstitution(
  db: Db,
  user: User,
  institutionId: string,
) {
  return (await readableInstitutionIds(db, user)).includes(institutionId);
}
