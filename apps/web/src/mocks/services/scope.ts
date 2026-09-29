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

/** Current supervision only: a supervisor sees the institutions assigned to them. */
export function supervisedInstitutionIds(supervisorId: string): string[] {
  return getDb()
    .supervisions.filter(
      (supervision) =>
        supervision.supervisorId === supervisorId &&
        supervision.validTo === null,
    )
    .map((supervision) => supervision.institutionId);
}

/** The current supervisor of an institution, if any. */
export function supervisorIdOf(institutionId: string) {
  return (
    getDb().supervisions.find(
      (supervision) =>
        supervision.institutionId === institutionId &&
        supervision.validTo === null,
    )?.supervisorId ?? null
  );
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
      return supervisedInstitutionIds(user.id);
    case 'administrator':
      return all;
  }
}

export function canReadInstitution(user: MockUser, institutionId: string) {
  return readableInstitutionIds(user).includes(institutionId);
}
