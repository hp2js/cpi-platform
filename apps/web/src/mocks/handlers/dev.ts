import { http, HttpResponse } from 'msw';
import { commit, getDb, resetDb } from '../db';

/** Development-only controls for exercising recovery paths; never part of the real API. */
export const devHandlers = [
  http.post('/api/__mock/email-failure', async ({ request }) => {
    const { enabled } = (await request.json()) as { enabled: boolean };
    commit((db) => {
      db.emailFailureMode = enabled;
    });
    return HttpResponse.json({ enabled });
  }),
  http.get('/api/__mock/email-failure', () =>
    HttpResponse.json({ enabled: getDb().emailFailureMode }),
  ),
  http.post('/api/__mock/expire-session', () => {
    commit((db) => {
      if (db.session) db.session.expired = true;
    });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/__mock/reset', () => {
    resetDb();
    return HttpResponse.json({ runId: getDb().runId });
  }),
];
