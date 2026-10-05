// @vitest-environment node
import {
  authConfigSchema,
  authTokenSchema,
  passwordProblems,
  peopleSchema,
  sessionSchema,
  signInChallengeSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import {
  emailedCode,
  emailedLink,
  emailedPassword,
  passwordSignIn,
} from '@/test/api-helpers';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';
import { DEMO_PASSWORD } from './services/auth';

/** Both steps: the password, then the emailed code. */
const signIn = passwordSignIn;

describe('password sign-in (PRD §13.1)', () => {
  it('signs in with email and password and never says which part was wrong', async () => {
    const config = await request('/api/auth/config', authConfigSchema);
    expect(config.providers[0]).toMatchObject({
      id: 'ecitizen',
      status: 'planned',
    });

    const session = await signIn('Officer.A@example.invalid', DEMO_PASSWORD);
    expect(session.user.id).toBe('officer-a');

    const wrongPassword = signIn(
      'officer.a@example.invalid',
      'not-the-password',
    );
    const unknownEmail = signIn('nobody@example.invalid', DEMO_PASSWORD);
    const [a, b] = await Promise.allSettled([wrongPassword, unknownEmail]);
    expect(a).toMatchObject({ status: 'rejected' });
    expect((a as PromiseRejectedResult).reason).toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
    expect((b as PromiseRejectedResult).reason.message).toBe(
      (a as PromiseRejectedResult).reason.message,
    );
  });

  it('starts a session only after the emailed code, which works once', async () => {
    const { challengeId } = await request(
      '/api/session',
      signInChallengeSchema,
      {
        method: 'POST',
        json: { email: 'officer.a@example.invalid', password: DEMO_PASSWORD },
      },
    );
    await expect(request('/api/session', sessionSchema)).rejects.toMatchObject({
      status: 401,
    });
    const code = emailedCode('officer.a@example.invalid');
    const confirm = (value: string) =>
      request('/api/session/code', sessionSchema, {
        method: 'POST',
        json: { challengeId, code: value },
      });
    await expect(
      confirm(code === '000000' ? '111111' : '000000'),
    ).rejects.toMatchObject({ status: 401, code: 'invalid_code' });
    expect((await confirm(code)).user.id).toBe('officer-a');
    await expect(confirm(code)).rejects.toMatchObject({
      status: 410,
      code: 'code_expired',
    });
  });

  it('locks an email for 15 minutes after five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(
        signIn('supervisor@example.invalid', `wrong-${attempt}`),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      signIn('supervisor@example.invalid', DEMO_PASSWORD),
    ).rejects.toMatchObject({ status: 429, code: 'too_many_attempts' });
  });

  it('refuses a deactivated account', async () => {
    getDb().users.find((user) => user.id === 'officer-b')!.active = false;
    await expect(
      signIn('officer.b@example.invalid', DEMO_PASSWORD),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('invitations', () => {
  it('emails a temporary password that must be replaced at first sign-in', async () => {
    await signInAs('administrator');
    await request('/api/settings/users', peopleSchema, {
      method: 'POST',
      json: {
        displayName: 'New Officer',
        email: 'new.officer@example.invalid',
        jobTitle: 'Prevention Officer',
        role: 'officer',
        institutionId: null,
      },
    });
    expect(getDb().emailSink.at(-1)).toMatchObject({
      to: 'new.officer@example.invalid',
      subject: 'You are invited to the CPI Platform',
    });
    // Only a hash is stored, and the secret skips the delivery outbox.
    const temporary = emailedPassword('new.officer@example.invalid');
    expect(JSON.stringify(getDb().users)).not.toContain(temporary);
    expect(JSON.stringify(getDb().deliveries)).not.toContain(temporary);
    expect(JSON.stringify(getDb().notifications)).not.toContain(temporary);

    const session = await signIn('new.officer@example.invalid', temporary);
    expect(session.user.mustChangePassword).toBe(true);
    await expect(
      request('/api/notifications', z.unknown()),
    ).rejects.toMatchObject({ status: 403, code: 'password_change_required' });
    await expect(
      request('/api/account/password', z.unknown(), {
        method: 'POST',
        json: { newPassword: temporary },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'weak_password' });
    await request('/api/account/password', z.undefined(), {
      method: 'POST',
      json: { newPassword: 'a-long-demo-passphrase' },
    });
    expect(
      (await request('/api/session', sessionSchema)).user.mustChangePassword,
    ).toBeUndefined();
    await expect(
      signIn('new.officer@example.invalid', temporary),
    ).rejects.toMatchObject({ status: 401 });
    await signIn('new.officer@example.invalid', 'a-long-demo-passphrase');
  });

  it('resends a replacement password and refuses an expired one', async () => {
    await signInAs('administrator');
    const people = await request('/api/settings/users', peopleSchema, {
      method: 'POST',
      json: {
        displayName: 'Deputy focal person',
        email: 'deputy.demo-002@example.invalid',
        jobTitle: '',
        role: 'institution',
        institutionId: 'DEMO-002',
      },
    });
    const user = people.users.find(
      (candidate) => candidate.email === 'deputy.demo-002@example.invalid',
    )!;
    expect(user.status).toBe('invited');
    expect(user.invitationExpiresAt).not.toBeNull();
    const first = emailedPassword(user.email);
    await request(`/api/settings/users/${user.id}/invitation`, peopleSchema, {
      method: 'POST',
    });
    const second = emailedPassword(user.email);
    expect(second).not.toBe(first);
    await expect(signIn(user.email, first)).rejects.toMatchObject({
      status: 401,
    });
    getDb().users.find(
      (candidate) => candidate.id === user.id,
    )!.passwordExpiresAt = '2020-01-01T00:00:00Z';
    await expect(signIn(user.email, second)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
  });
});

describe('password reset and change', () => {
  it('answers every reset request the same way and resets by email link', async () => {
    const before = getDb().emailSink.length;
    const unknown = await request(
      '/api/auth/password-reset',
      z.object({ message: z.string() }),
      {
        method: 'POST',
        json: { email: 'nobody@example.invalid' },
      },
    );
    expect(getDb().emailSink.length).toBe(before);
    const known = await request(
      '/api/auth/password-reset',
      z.object({ message: z.string() }),
      {
        method: 'POST',
        json: { email: 'focal.demo-003@example.invalid' },
      },
    );
    expect(known.message).toBe(unknown.message);
    const token = emailedLink('focal.demo-003@example.invalid');
    expect(
      (await request(`/api/auth/tokens/${token}`, authTokenSchema)).purpose,
    ).toBe('reset');
    await request(`/api/auth/tokens/${token}`, sessionSchema, {
      method: 'POST',
      json: { password: 'another-long-passphrase' },
    });
    await expect(
      signIn('focal.demo-003@example.invalid', DEMO_PASSWORD),
    ).rejects.toMatchObject({ status: 401 });
    await signIn('focal.demo-003@example.invalid', 'another-long-passphrase');
  });

  it('changes a password only with the current one', async () => {
    await signInAs('focal-demo-004');
    const change = (currentPassword: string, newPassword: string) =>
      request('/api/account/password', z.unknown(), {
        method: 'POST',
        json: { currentPassword, newPassword },
      });
    await expect(
      change('wrong', 'a-new-long-passphrase'),
    ).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      change(DEMO_PASSWORD, 'focal.demo-004-pass'),
    ).rejects.toMatchObject({
      code: 'weak_password',
    });
    await change(DEMO_PASSWORD, 'a-new-long-passphrase');
    await signIn('focal.demo-004@example.invalid', 'a-new-long-passphrase');
  });

  it('applies NIST-style password rules', () => {
    expect(passwordProblems('short')).toEqual(['Use at least 12 characters.']);
    expect(passwordProblems('password1234')).toContain(
      'Choose a less common password.',
    );
    expect(passwordProblems('aaaaaaaaaaaaaaa')).toContain(
      'Choose a less common password.',
    );
    expect(
      passwordProblems('amina.focal-secret', 'amina.focal@example.invalid'),
    ).toContain('Do not include your email address.');
    expect(passwordProblems('correct horse battery staple')).toEqual([]);
  });
});
