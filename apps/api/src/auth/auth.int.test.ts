import { eq } from 'drizzle-orm';
import type {
  Account,
  AuthConfig,
  AuthToken,
  DemoAccount,
  People,
  Session,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { STRONG_PASSWORD, emailedToken } from '../test/journeys';
import { DEMO_PASSWORD } from './passwords';

const WRONG = 'The email or password is not right. Check both and try again.';

/** Ported from apps/web/src/mocks/auth.test.ts (PRD §13.1, HP2-13). */
describe.skipIf(!integration)(
  'password sign-in, invitations and accounts',
  () => {
    let api: Awaited<ReturnType<typeof startApi>>;
    let admin: Client;
    beforeAll(async () => {
      api = await startApi();
    }, 60_000);
    afterAll(() => api?.stop());
    beforeEach(async () => {
      await api.reset();
      await api.flushRedis();
      admin = await api.client().signIn('administrator');
    });

    const signIn = (client: Client, email: string, password: string) =>
      client.post('/session', { email, password });

    it('signs in with the published demo password and one generic error otherwise', async () => {
      expect(await api.client().json<AuthConfig>('/auth/config')).toMatchObject(
        {
          passwordSignIn: true,
          demoPassword: DEMO_PASSWORD,
        },
      );
      const client = api.client();
      const ok = await signIn(
        client,
        'Officer.A@example.invalid',
        DEMO_PASSWORD,
      );
      expect(ok.status).toBe(200);
      expect((ok.body as Session).user.id).toBe('officer-a');
      expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i);
      for (const [email, password] of [
        ['officer.a@example.invalid', 'not the password'],
        ['nobody@example.invalid', DEMO_PASSWORD],
      ])
        expect(await signIn(api.client(), email!, password!)).toMatchObject({
          status: 401,
          body: { code: 'invalid_credentials', message: WRONG },
        });
      expect(
        await api
          .client()
          .post('/session', { email: 'officer.a@example.invalid' }),
      ).toMatchObject({ status: 422, body: { code: 'invalid_request' } });
    });

    it('locks an email for 15 minutes after five failures, whether or not it exists', async () => {
      for (const email of [
        'focal.demo-003@example.invalid',
        'ghost@example.invalid',
      ]) {
        for (let attempt = 0; attempt < 5; attempt += 1)
          expect(
            (await signIn(api.client(), email, 'wrong password')).status,
          ).toBe(401);
        expect(await signIn(api.client(), email, DEMO_PASSWORD)).toMatchObject({
          status: 429,
          body: { code: 'too_many_attempts' },
        });
      }
    });

    it('invites a new account that signs in only after setting a password', async () => {
      const people = (
        await admin.post('/settings/users', {
          displayName: 'Deputy focal person, DEMO-001',
          email: 'deputy.demo-001@example.invalid',
          jobTitle: 'Deputy Integrity Officer',
          role: 'institution',
          institutionId: 'DEMO-001',
        })
      ).body as People;
      const deputy = people.users.find(
        (user) => user.email === 'deputy.demo-001@example.invalid',
      )!;
      expect(deputy.status).toBe('invited');
      expect(deputy.invitationExpiresAt).not.toBeNull();
      // Invited accounts are not offered as demo accounts until they finish setting up.
      expect(
        (await api.client().json<DemoAccount[]>('/demo/accounts')).map(
          (account) => account.id,
        ),
      ).not.toContain(deputy.id);
      expect(
        await api.client().post('/session', { accountId: deputy.id }),
      ).toMatchObject({ status: 422, body: { code: 'invalid_account' } });

      const token = await emailedToken(admin, deputy.email);
      const visitor = api.client();
      expect(
        await visitor.json<AuthToken>(`/auth/tokens/${token}`),
      ).toMatchObject({
        purpose: 'invitation',
        email: deputy.email,
        displayName: deputy.displayName,
      });
      expect(
        await visitor.post(`/auth/tokens/${token}`, { password: 'short' }),
      ).toMatchObject({ status: 422, body: { code: 'weak_password' } });
      const set = await visitor.post(`/auth/tokens/${token}`, {
        password: STRONG_PASSWORD,
      });
      expect(set.status).toBe(200);
      expect((set.body as Session).user.id).toBe(deputy.id);
      // Single use.
      expect((await api.client().request(`/auth/tokens/${token}`)).status).toBe(
        404,
      );
      expect(
        (await signIn(api.client(), deputy.email, STRONG_PASSWORD)).status,
      ).toBe(200);
      expect(
        await admin.post(`/settings/users/${deputy.id}/invitation`),
      ).toMatchObject({ status: 409, body: { code: 'not_invited' } });
    });

    it('resets a password by email link, which expires', async () => {
      const reset = await api.client().post('/auth/password-reset', {
        email: 'focal.demo-002@example.invalid',
      });
      expect(reset.status).toBe(202);
      // Unknown addresses get the same answer and no email.
      expect(
        (
          await api
            .client()
            .post('/auth/password-reset', { email: 'nobody@example.invalid' })
        ).status,
      ).toBe(202);
      const token = await emailedToken(admin, 'focal.demo-002@example.invalid');
      expect(
        await api.client().json<AuthToken>(`/auth/tokens/${token}`),
      ).toMatchObject({ purpose: 'reset' });
      expect(
        (
          await api
            .client()
            .post(`/auth/tokens/${token}`, { password: STRONG_PASSWORD })
        ).status,
      ).toBe(200);
      expect(
        (
          await signIn(
            api.client(),
            'focal.demo-002@example.invalid',
            DEMO_PASSWORD,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await signIn(
            api.client(),
            'focal.demo-002@example.invalid',
            STRONG_PASSWORD,
          )
        ).status,
      ).toBe(200);

      await api.client().post('/auth/password-reset', {
        email: 'focal.demo-003@example.invalid',
      });
      const stale = await emailedToken(admin, 'focal.demo-003@example.invalid');
      await api.db
        .update(users)
        .set({
          authLink: {
            purpose: 'reset',
            tokenHash: (
              await api.db
                .select()
                .from(users)
                .where(eq(users.id, 'focal-demo-003'))
            )[0]!.authLink!.tokenHash,
            expiresAt: '2020-01-01T00:00:00+03:00',
          },
        })
        .where(eq(users.id, 'focal-demo-003'));
      expect(await api.client().request(`/auth/tokens/${stale}`)).toMatchObject(
        {
          status: 410,
          body: { code: 'link_expired' },
        },
      );
    });

    it('lets a person maintain their own account and change their password', async () => {
      const officer = await api.client().signIn('officer-a');
      expect(await officer.json<Account>('/account')).toMatchObject({
        id: 'officer-a',
        role: 'officer',
        institution: null,
        portfolioSize: 4,
      });
      const focal = await api.client().signIn('focal-demo-001');
      expect(await focal.json<Account>('/account')).toMatchObject({
        institution: { id: 'DEMO-001' },
        reviewingOfficer: 'Prevention Officer A',
      });
      const updated = (
        await officer.put('/account', {
          displayName: 'Prevention Officer A',
          jobTitle: 'Senior Prevention Officer',
          phone: '+254 700 000 000',
        })
      ).body as Account;
      expect(updated).toMatchObject({
        jobTitle: 'Senior Prevention Officer',
        phone: '+254 700 000 000',
      });
      expect(
        await officer.post('/account/password', {
          currentPassword: 'wrong',
          newPassword: STRONG_PASSWORD,
        }),
      ).toMatchObject({ status: 422, body: { code: 'invalid_password' } });
      expect(
        (
          await officer.post('/account/password', {
            currentPassword: DEMO_PASSWORD,
            newPassword: STRONG_PASSWORD,
          })
        ).status,
      ).toBe(204);
      expect(
        (
          await signIn(
            api.client(),
            'officer.a@example.invalid',
            STRONG_PASSWORD,
          )
        ).status,
      ).toBe(200);
    });
  },
);

describe.skipIf(!integration)('outside demo mode', () => {
  it('refuses the published demo password', async () => {
    const api = await startApi({ DEMO_MODE: 'false' });
    try {
      await api.flushRedis();
      const config = await api.client().json<AuthConfig>('/auth/config');
      expect(config).toMatchObject({ demoAccounts: false, demoPassword: null });
      expect(
        (
          await api.client().post('/session', {
            email: 'officer.a@example.invalid',
            password: DEMO_PASSWORD,
          })
        ).status,
      ).toBe(401);
    } finally {
      await api.stop();
    }
  }, 60_000);
});
