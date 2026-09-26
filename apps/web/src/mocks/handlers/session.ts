import { http, HttpResponse } from 'msw';
import { signInRequestSchema, type DemoAccount } from '@cpi/contracts';
import { commit, getDb } from '../db';
import { apiError } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireUser, toSession } from '../services/session';

export const sessionHandlers = [
  http.get('/api/demo/accounts', async () => {
    await networkDelay();
    const accounts: DemoAccount[] = getDb()
      .users.filter((user) => user.active)
      .map(({ id, displayName, role, institutionId }) => ({
        id,
        displayName,
        role,
        ...(institutionId ? { institutionId } : {}),
      }));
    return HttpResponse.json(accounts);
  }),
  http.get('/api/session', async () => {
    await networkDelay();
    return HttpResponse.json(toSession(requireUser()));
  }),
  http.post('/api/session', async ({ request }) => {
    await networkDelay();
    const parsed = signInRequestSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    const user = parsed.success
      ? getDb().users.find(
          (candidate) =>
            candidate.id === parsed.data.accountId && candidate.active,
        )
      : undefined;
    if (!user)
      return apiError(422, 'Choose an active demo account.', 'invalid_account');
    commit((db) => {
      db.session = { userId: user.id, expired: false };
    });
    return HttpResponse.json(toSession(user));
  }),
  http.delete('/api/session', async () => {
    await networkDelay();
    commit((db) => {
      db.session = null;
    });
    return new HttpResponse(null, { status: 204 });
  }),
];
