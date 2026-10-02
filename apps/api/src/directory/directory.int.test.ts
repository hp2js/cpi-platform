import type {
  Assignment,
  AuthConfig,
  DemoAccount,
  Institution,
  Obligation,
  Session,
} from '@cpi/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { supervisions } from '../database/schema';
import { integration, startApi } from '../test/api';

/** Ported from apps/web/src/mocks/scope.test.ts (PRD §5.2, AT01, AT02). */
describe.skipIf(!integration)('session and directory', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());

  it('limits an institution user to its own institution', async () => {
    const client = await api.client().signIn('focal-demo-001');
    const institutions = await client.json<Institution[]>('/institutions');
    expect(institutions.map((institution) => institution.id)).toEqual([
      'DEMO-001',
    ]);
    expect((await client.request('/institutions/DEMO-002')).status).toBe(404);
    expect(
      (await client.request('/obligations?institutionId=DEMO-002')).status,
    ).toBe(404);
    expect(await client.request('/assignments')).toMatchObject({
      status: 403,
      body: { code: 'forbidden' },
    });
  });

  it('limits an officer to currently assigned institutions', async () => {
    const client = await api.client().signIn('officer-a');
    const institutions = await client.json<Institution[]>('/institutions');
    expect(institutions.map((institution) => institution.id)).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
      'DEMO-004',
    ]);
    expect((await client.request('/institutions/DEMO-005')).status).toBe(404);
    const assignments = await client.json<Assignment[]>('/assignments');
    expect(
      new Set(assignments.map((assignment) => assignment.officerId)),
    ).toEqual(new Set(['officer-a']));
  });

  it('limits a supervisor to currently supervised institutions (PRD §5.2)', async () => {
    await api.db
      .update(supervisions)
      .set({ validTo: '2026-09-01T00:00:00+03:00' })
      .where(eq(supervisions.institutionId, 'DEMO-008'));
    const client = await api.client().signIn('supervisor');
    const institutions = await client.json<Institution[]>('/institutions');
    expect(institutions.map((institution) => institution.id)).not.toContain(
      'DEMO-008',
    );
    expect(institutions[0]).toMatchObject({ activeFocalPersons: 1 });
    expect((await client.request('/institutions/DEMO-008')).status).toBe(404);
  });

  it('gives the supervisor all 32 institution-quarter obligations', async () => {
    const client = await api.client().signIn('supervisor');
    expect(await client.json<Obligation[]>('/obligations')).toHaveLength(32);
  });

  it('reports an expired session distinctly from a missing one', async () => {
    const client = api.client();
    expect(await client.request('/session')).toMatchObject({
      status: 401,
      body: { code: 'unauthenticated' },
    });
    await client.signIn('supervisor');
    client.forgetCookieValue();
    expect(await client.request('/institutions')).toMatchObject({
      status: 401,
      body: { code: 'session_expired' },
    });
  });

  it('signs in with an HttpOnly cookie and signs out', async () => {
    const client = api.client();
    const signIn = await client.post('/session', {
      accountId: 'administrator',
    });
    expect(signIn.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const session = signIn.body as Session;
    expect(session).toMatchObject({
      user: { id: 'administrator', role: 'administrator' },
      clock: {
        runId: 'run-001',
        businessTime: '2026-10-01T08:00:00+03:00',
        timezone: 'Africa/Nairobi',
      },
      profile: { id: 'hackathon-mock-v1', simulation: true },
    });
    expect(
      (await client.request('/session', { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await client.request('/session')).status).toBe(401);
  });

  it('refuses unknown or inactive demo accounts', async () => {
    expect(
      await api.client().post('/session', { accountId: 'nobody' }),
    ).toMatchObject({ status: 422, body: { code: 'invalid_account' } });
  });

  it('marks future quarters not yet due at the start of Q1 reporting', async () => {
    const client = await api.client().signIn('focal-demo-001');
    const obligations = await client.json<Obligation[]>('/obligations');
    expect(obligations.map((obligation) => obligation.flags)).toEqual([
      [],
      ['not_yet_due'],
      ['not_yet_due'],
      ['not_yet_due'],
    ]);
  });
});

describe.skipIf(!integration)('sign-in configuration', () => {
  it('describes demo sign-in and turns it off outside demo mode', async () => {
    const demo = await startApi();
    try {
      const client = demo.client();
      expect(await client.json<AuthConfig>('/auth/config')).toMatchObject({
        passwordSignIn: true,
        demoAccounts: true,
        providers: [{ id: 'ecitizen', status: 'planned' }],
      });
      expect(
        (await client.json<DemoAccount[]>('/demo/accounts')).length,
      ).toBeGreaterThan(0);
    } finally {
      await demo.stop();
    }

    const real = await startApi({
      DEMO_MODE: 'false',
      ADMIN_EMAIL: 'operator@example.invalid',
    });
    try {
      const client = real.client();
      expect(await client.json<AuthConfig>('/auth/config')).toMatchObject({
        demoAccounts: false,
      });
      expect((await client.request('/demo/accounts')).status).toBe(404);
      expect(
        await client.post('/session', { accountId: 'administrator' }),
      ).toMatchObject({ status: 422, body: { code: 'demo_disabled' } });
    } finally {
      await real.stop();
    }
  }, 60_000);
});
