import { http, HttpResponse } from 'msw';
import { accountUpdateSchema, type Account } from '@cpi/contracts';
import { commit, getDb } from '../db';
import type { MockUser } from '../seed/cast';
import { audit } from '../services/events';
import { apiError } from '../services/http';
import { networkDelay } from '../services/latency';
import { assignedInstitutionIds } from '../services/scope';
import { requireUser } from '../services/session';

/**
 * My account: every signed-in user maintains their own name, job title and phone. Email and
 * role are the sign-in identity and scope, managed by the administrator (and, in production,
 * the identity provider), so they are shown but not editable here.
 */
function account(user: MockUser): Account {
  const db = getDb();
  const institution = db.institutions.find(
    (candidate) => candidate.id === user.institutionId,
  );
  const reviewer = institution
    ? db.users.find(
        (candidate) =>
          candidate.id ===
          db.assignments.find(
            (assignment) =>
              assignment.institutionId === institution.id &&
              assignment.validTo === null,
          )?.officerId,
      )
    : undefined;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle ?? '',
    phone: user.phone ?? '',
    institution: institution
      ? { id: institution.id, name: institution.name }
      : null,
    reviewingOfficer: reviewer?.displayName ?? null,
    portfolioSize:
      user.role === 'officer' ? assignedInstitutionIds(user.id).length : null,
  };
}

export const accountHandlers = [
  http.get('/api/account', async () => {
    await networkDelay();
    return HttpResponse.json(account(requireUser()));
  }),
  http.put('/api/account', async ({ request }) => {
    await networkDelay();
    const user = requireUser();
    const parsed = accountUpdateSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!parsed.success)
      return apiError(
        422,
        'Some details need attention.',
        'invalid_account',
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      );
    commit((db) => {
      const changed = (['displayName', 'jobTitle', 'phone'] as const).filter(
        (key) => (user[key] ?? '') !== parsed.data[key],
      );
      user.displayName = parsed.data.displayName;
      user.jobTitle = parsed.data.jobTitle;
      user.phone = parsed.data.phone;
      audit(
        db,
        user,
        'account.update',
        { type: 'user', id: user.id },
        changed.length ? `Updated ${changed.join(', ')}` : 'No changes',
      );
    });
    return HttpResponse.json(account(user));
  }),
];
