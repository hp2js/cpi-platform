import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../database/db';
import { assignments, institutions } from '../database/schema';
import type { User } from './sessions';

/** Current assignment only: reassignment removes access immediately (PRD §5.2). */
export async function assignedInstitutionIds(db: Db, officerId: string) {
  const rows = await db
    .select({ id: assignments.institutionId })
    .from(assignments)
    .where(
      and(eq(assignments.officerId, officerId), isNull(assignments.validTo)),
    );
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
    case 'administrator':
      return (await db.select({ id: institutions.id }).from(institutions)).map(
        (row) => row.id,
      );
  }
}

export async function canReadInstitution(
  db: Db,
  user: User,
  institutionId: string,
) {
  return (await readableInstitutionIds(db, user)).includes(institutionId);
}
