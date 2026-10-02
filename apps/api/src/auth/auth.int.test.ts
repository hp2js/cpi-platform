import { desc, eq } from 'drizzle-orm';
import type {
  Account,
  AuthConfig,
  AuthToken,
  DemoAccount,
  People,
  Session,
  SignInChallenge,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { PLATFORM_ADMIN_ID, loadFixtures } from '../database/fixtures';
import {
  cycles,
  emailSink,
  institutions,
  obligations,
  users,
} from '../database/schema';
import type { Mailer } from '../email/mailer';
import { integration, startApi, type Client } from '../test/api';
import {
  STRONG_PASSWORD,
  emailedCode,
  emailedPassword,
  emailedToken,
  passwordSignIn,
} from '../test/journeys';
import { DEMO_PASSWORD, hashPassword } from './passwords';

const WRONG = 'The email or password is not right. Check both and try again.';

/** Ported from apps/web/src/mocks/auth.test.ts (PRD §13.1, HP2-13). */
describe.skipIf(!integration)(
  'password sign-in with emailed codes, invitations and accounts',
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
      const ok = await passwordSignIn(
        client,
        admin,
        'Officer.A@example.invalid',
        DEMO_PASSWORD,
      );
      expect(ok.status).toBe(200);
      expect((ok.body as Session).user.id).toBe('officer-a');
      expect((ok.body as Session).user.mustChangePassword).toBeUndefined();
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

    it('starts a session only after the emailed code, which works once', async () => {
      const client = api.client();
      const first = await signIn(
        client,
        'officer.a@example.invalid',
        DEMO_PASSWORD,
      );
      expect(first.status).toBe(202);
      expect(first.headers.get('set-cookie')).toBeNull();
      const { challengeId, expiresAt } = first.body as SignInChallenge;
      expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(9 * 60_000);
      expect((await client.request('/session')).status).toBe(401);
      const code = await emailedCode(admin, 'officer.a@example.invalid');
      const wrong = code === '000000' ? '111111' : '000000';
      expect(
        await client.post('/session/code', { challengeId, code: wrong }),
      ).toMatchObject({ status: 401, body: { code: 'invalid_code' } });
      expect(
        await client.post('/session/code', { challengeId, code: 'abc' }),
      ).toMatchObject({ status: 422 });
      expect(
        (await client.post('/session/code', { challengeId, code })).status,
      ).toBe(200);
      expect((await client.request('/session')).status).toBe(200);
      expect(
        await api.client().post('/session/code', { challengeId, code }),
      ).toMatchObject({ status: 410, body: { code: 'code_expired' } });

      // Five wrong codes end the challenge, even for the right code afterwards.
      const again = await signIn(
        api.client(),
        'officer.b@example.invalid',
        DEMO_PASSWORD,
      );
      const id = (again.body as SignInChallenge).challengeId;
      const right = await emailedCode(admin, 'officer.b@example.invalid');
      const miss = right === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 5; attempt += 1)
        await api
          .client()
          .post('/session/code', { challengeId: id, code: miss });
      expect(
        await api
          .client()
          .post('/session/code', { challengeId: id, code: right }),
      ).toMatchObject({ status: 410, body: { code: 'code_expired' } });
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

    it('emails a new account a temporary password that must be replaced at first sign-in', async () => {
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

      // Only a hash is stored; the password is in the email.
      const temporary = await emailedPassword(admin, deputy.email);
      expect(temporary).toMatch(/^[\w]{4}-[\w]{4}-[\w]{4}-[\w]{4}$/);
      const [row] = await api.db
        .select()
        .from(users)
        .where(eq(users.id, deputy.id));
      expect(row!.passwordHash).toMatch(/^scrypt\$/);
      expect(JSON.stringify(row)).not.toContain(temporary);

      // A new invitation replaces the temporary password.
      await admin.post(`/settings/users/${deputy.id}/invitation`);
      expect((await signIn(api.client(), deputy.email, temporary)).status).toBe(
        401,
      );
      const latest = await emailedPassword(admin, deputy.email);

      const person = api.client();
      const signedIn = await passwordSignIn(
        person,
        admin,
        deputy.email,
        latest,
      );
      expect(signedIn.status).toBe(200);
      expect((signedIn.body as Session).user.mustChangePassword).toBe(true);
      // Nothing but the password change answers until then.
      expect(await person.request('/notifications')).toMatchObject({
        status: 403,
        body: { code: 'password_change_required' },
      });
      expect((await person.request('/account')).status).toBe(200);
      expect(
        await person.post('/account/password', { newPassword: latest }),
      ).toMatchObject({ status: 422, body: { code: 'weak_password' } });
      expect(
        (
          await person.post('/account/password', {
            newPassword: STRONG_PASSWORD,
          })
        ).status,
      ).toBe(204);
      expect(
        (await person.json<Session>('/session')).user.mustChangePassword,
      ).toBeUndefined();
      expect((await person.request('/notifications')).status).toBe(200);

      expect((await signIn(api.client(), deputy.email, latest)).status).toBe(
        401,
      );
      expect(
        (
          await passwordSignIn(
            api.client(),
            admin,
            deputy.email,
            STRONG_PASSWORD,
          )
        ).status,
      ).toBe(200);
      expect(
        await admin.post(`/settings/users/${deputy.id}/invitation`),
      ).toMatchObject({ status: 409, body: { code: 'not_invited' } });
    });

    it('refuses an expired temporary password', async () => {
      const people = (
        await admin.post('/settings/users', {
          displayName: 'Late starter',
          email: 'late.starter@example.invalid',
          jobTitle: '',
          role: 'officer',
          institutionId: null,
        })
      ).body as People;
      const late = people.users.find(
        (user) => user.email === 'late.starter@example.invalid',
      )!;
      const temporary = await emailedPassword(admin, late.email);
      await api.db
        .update(users)
        .set({ passwordExpiresAt: '2020-01-01T00:00:00+03:00' })
        .where(eq(users.id, late.id));
      expect(await signIn(api.client(), late.email, temporary)).toMatchObject({
        status: 401,
        body: { code: 'invalid_credentials' },
      });
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
          await passwordSignIn(
            api.client(),
            admin,
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
          await passwordSignIn(
            api.client(),
            admin,
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
    const api = await startApi({
      DEMO_MODE: 'false',
      ADMIN_EMAIL: 'operator@example.invalid',
    });
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

describe.skipIf(!integration)('sign-in addresses', () => {
  const create = (admin: Client, email: string) =>
    admin.post('/settings/users', {
      displayName: 'Real address person',
      email,
      jobTitle: '',
      role: 'officer',
      institutionId: null,
    });

  it('accepts only fictional addresses in demo mode', async () => {
    const api = await startApi();
    try {
      await api.reset();
      const admin = await api.client().signIn('administrator');
      expect(await create(admin, 'person@example.com')).toMatchObject({
        status: 422,
        body: {
          fieldErrors: { email: 'Use a fictional @example.invalid address.' },
        },
      });
      expect(await create(admin, 'not-an-email')).toMatchObject({
        status: 422,
      });
    } finally {
      await api.stop();
    }
  }, 60_000);

  it('accepts any valid address outside demo mode', async () => {
    const api = await startApi({
      DEMO_MODE: 'false',
      ADMIN_EMAIL: 'operator@example.invalid',
    });
    try {
      await api.reset();
      await api.flushRedis();
      // Demo sign-in is off, so the administrator signs in with a password and code.
      const [row] = await api.db
        .select()
        .from(users)
        .where(eq(users.id, 'administrator'));
      await api.db
        .update(users)
        .set({ passwordHash: await hashPassword(STRONG_PASSWORD) })
        .where(eq(users.id, row!.id));
      const admin = api.client();
      const first = await admin.post('/session', {
        email: row!.email,
        password: STRONG_PASSWORD,
      });
      const [code] = await api.db
        .select({ body: emailSink.body })
        .from(emailSink)
        .orderBy(desc(emailSink.seq))
        .limit(1);
      expect(
        (
          await admin.post('/session/code', {
            challengeId: (first.body as SignInChallenge).challengeId,
            code: /Your sign-in code is (\d{6})/.exec(code!.body)![1],
          })
        ).status,
      ).toBe(200);
      const created = await create(admin, 'Person@Example.com');
      expect(created.status).toBe(201);
      expect(
        (created.body as People).users.find(
          (user) => user.email === 'Person@Example.com',
        )?.status,
      ).toBe('invited');
    } finally {
      await api.stop();
    }
  }, 60_000);
});

describe.skipIf(!integration)('seeding', () => {
  it('seeds a clean cycle without demo mode, and keeps the configured administrator', async () => {
    const api = await startApi();
    const sent: { to: string; password: string }[] = [];
    const mailer = {
      link: (path: string) => path,
      send: async (message: { to: string; email: ReactElement }) => {
        sent.push({
          to: message.to,
          password: (message.email.props as { password: string }).password,
        });
      },
    } as unknown as Mailer;
    const administrator = {
      email: 'Operator@Agency.example',
      displayName: 'Real Operator',
      mailer,
    };
    try {
      await loadFixtures(api.db, { demo: false, administrator });
      expect(
        (await api.db.select().from(users)).map((user) => [
          user.id,
          user.email,
          user.role,
        ]),
      ).toEqual([
        [PLATFORM_ADMIN_ID, 'operator@agency.example', 'administrator'],
      ]);
      expect(await api.db.select().from(institutions)).toEqual([]);
      expect(await api.db.select().from(obligations)).toEqual([]);
      expect(await api.db.select().from(cycles)).toHaveLength(1);
      expect(sent).toEqual([
        { to: 'operator@agency.example', password: expect.any(String) },
      ]);
      const [admin] = await api.db.select().from(users);
      expect(admin!.passwordExpiresAt).not.toBeNull();
      expect(admin!.passwordHash).toMatch(/^scrypt\$/);

      // A reset keeps the account and its password, and sends nothing new.
      await loadFixtures(api.db, { demo: true, administrator });
      const [kept] = await api.db
        .select()
        .from(users)
        .where(eq(users.id, PLATFORM_ADMIN_ID));
      expect(kept!.passwordHash).toBe(admin!.passwordHash);
      expect(sent).toHaveLength(1);
      // Demo mode adds the fictional year around it.
      expect((await api.db.select().from(users)).length).toBeGreaterThan(1);
    } finally {
      await api.reset();
      await api.stop();
    }
  }, 60_000);

  it('refuses to replace real records with a simulation run', async () => {
    const api = await startApi({
      DEMO_MODE: 'false',
      ADMIN_EMAIL: 'operator@example.invalid',
    });
    try {
      await api.flushRedis();
      const [row] = await api.db
        .select()
        .from(users)
        .where(eq(users.id, 'administrator'));
      await api.db
        .update(users)
        .set({ passwordHash: await hashPassword(STRONG_PASSWORD) })
        .where(eq(users.id, row!.id));
      const admin = api.client();
      const first = await admin.post('/session', {
        email: row!.email,
        password: STRONG_PASSWORD,
      });
      const [mail] = await api.db
        .select({ body: emailSink.body })
        .from(emailSink)
        .orderBy(desc(emailSink.seq))
        .limit(1);
      await admin.post('/session/code', {
        challengeId: (first.body as SignInChallenge).challengeId,
        code: /Your sign-in code is (\d{6})/.exec(mail!.body)![1],
      });
      for (const path of ['/simulation/reset', '/simulation/scenario'])
        expect(await admin.post(path)).toMatchObject({
          status: 409,
          body: { code: 'demo_only' },
        });
    } finally {
      await api.stop();
    }
  }, 60_000);
});
