import type { Session } from '@cpi/contracts';
import { getDb } from '../db';
import type { MockUser } from '../seed/cast';
import { apiError } from './http';
import { activeProfile } from './profiles';

export function currentUser(): MockUser | undefined {
  const { session, users } = getDb();
  if (!session || session.expired) return undefined;
  return users.find((user) => user.id === session.userId && user.active);
}

/** Resolve the caller or throw a 401 response, as the server's auth guard would. */
export function requireUser(): MockUser {
  const { session } = getDb();
  const user = currentUser();
  if (user) return user;
  throw session?.expired
    ? apiError(
        401,
        'Your session has expired. Sign in again to continue.',
        'session_expired',
      )
    : apiError(401, 'Sign in to continue.', 'unauthenticated');
}

export function toSession(user: MockUser): Session {
  const db = getDb();
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      ...(user.institutionId ? { institutionId: user.institutionId } : {}),
      ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
    },
    clock: {
      runId: db.runId,
      businessTime: db.businessTime,
      timezone: db.cycle.timezone,
    },
    profile: {
      id: activeProfile(db).id,
      name: activeProfile(db).name,
      simulation: activeProfile(db).simulation,
    },
  };
}

/** Resolve the caller and require one of the given roles, or throw 403. */
export function requireRole(...roles: MockUser['role'][]): MockUser {
  const user = requireUser();
  if (!roles.includes(user.role))
    throw apiError(403, 'You do not have access to this action.', 'forbidden');
  return user;
}
