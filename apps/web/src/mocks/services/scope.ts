import { getDb } from '../db';
import type { MockUser } from '@cpi/contracts/fixtures';

/** Current assignment only: reassignment removes access immediately (PRD §5.2). */
export function assignedInstitutionIds(officerId: string): string[] {
  return getDb()
    .assignments.filter(
      (assignment) =>
        assignment.officerId === officerId && assignment.validTo === null,
    )
    .map((assignment) => assignment.institutionId);
}

/** Institutions whose submitted records the caller may read. */
export function readableInstitutionIds(user: MockUser): string[] {
  const all = getDb().institutions.map((institution) => institution.id);
  switch (user.role) {
    case 'institution':
      return user.institutionId ? [user.institutionId] : [];
    case 'officer':
      return assignedInstitutionIds(user.id);
    case 'supervisor':
    case 'administrator':
      return all;
  }
}

export function canReadInstitution(user: MockUser, institutionId: string) {
  return readableInstitutionIds(user).includes(institutionId);
}
