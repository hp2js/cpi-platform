import { Inject, Injectable } from '@nestjs/common';
import { createElement } from 'react';
import {
  demoSignInSchema,
  passwordProblems,
  passwordSignInSchema,
  setPasswordSchema,
  type AuthConfig,
  type AuthToken,
  type DemoAccount,
  type Session,
  type SignInChallenge,
  type passwordResetRequestSchema,
  type signInCodeSchema,
} from '@cpi/contracts';
import type { z } from 'zod';
import { CONFIG, type AppConfig } from '../config';
import { DB, write, type Database, type Db } from '../database/db';
import { toNairobi } from '../database/schema';
import { currentState } from '../database/state';
import { Mailer } from '../email/mailer';
import { PasswordResetEmail, SignInCodeEmail } from '../email/templates';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { AuthRepository } from './auth.repository';
import {
  DEMO_PASSWORD,
  accountStatus,
  canSignIn,
  hashPassword,
  hashToken,
  newLink,
  passwordMatches,
  signInCode,
} from './passwords';
import { CODE_TTL_MS, Sessions, type User } from './sessions';

/** One message for every failure, so the form never reveals which emails have accounts. */
const WRONG = 'The email or password is not right. Check both and try again.';

/** Signed in at once (demo), or a code was emailed to finish password sign-in. */
export type SignInResult = { user: User } | { challenge: SignInChallenge };

/**
 * Sign-in (password, then an emailed code), password resets and links (PRD §13.1, HP2-13).
 * The controller starts the session cookie for the user these methods return.
 */
@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly repository: AuthRepository,
    private readonly sessions: Sessions,
    private readonly events: Events,
    private readonly mailer: Mailer,
  ) {}

  authConfig(): AuthConfig {
    return {
      passwordSignIn: true,
      demoAccounts: this.config.DEMO_MODE,
      demoPassword: this.config.DEMO_MODE ? DEMO_PASSWORD : null,
      providers: [
        {
          id: 'ecitizen',
          name: 'eCitizen',
          status: 'planned',
          description:
            'Sign-in through the government eCitizen service is a planned option. It would use OpenID Connect: eCitizen confirms who the person is, and this platform still decides their role and institution. It is not connected in this demonstration, and no agreement with eCitizen is implied.',
        },
      ],
    };
  }

  /** Demo mode only: fictional accounts that have finished setting up. */
  async demoAccounts(): Promise<DemoAccount[]> {
    if (!this.config.DEMO_MODE) throw notFound();
    const rows = await this.repository.usersWithInstitution();
    return rows
      .filter(({ user }) => accountStatus(user) === 'active')
      .map(({ user, institutionName }) => ({
        id: user.id,
        displayName: user.displayName,
        role: user.role,
        ...(user.institutionId ? { institutionId: user.institutionId } : {}),
        ...(institutionName ? { institutionName } : {}),
      }));
  }

  /** A demo account ID signs in directly; an email and password get an emailed code. */
  async signIn(body: unknown): Promise<SignInResult> {
    const demo = demoSignInSchema.safeParse(body);
    if (demo.success) {
      if (!this.config.DEMO_MODE)
        throw new ApiError(
          422,
          'Demo sign-in is not available on this deployment.',
          'demo_disabled',
        );
      const user = await this.repository.user(demo.data.accountId);
      if (!user || accountStatus(user) !== 'active')
        throw new ApiError(
          422,
          'Choose an active demo account.',
          'invalid_account',
        );
      return { user };
    }

    const parsed = passwordSignInSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(
        422,
        'Enter your email and password.',
        'invalid_request',
        {
          ...(typeof (body as { email?: unknown } | undefined)?.email ===
          'string'
            ? {}
            : { email: 'Enter your email.' }),
          password: 'Enter your password.',
        },
      );
    const email = parsed.data.email.toLowerCase();
    const wait = await this.sessions.lockedFor(email);
    if (wait)
      throw new ApiError(
        429,
        `Too many attempts. Try again in ${Math.ceil(wait / 60_000)} minutes, or reset your password.`,
        'too_many_attempts',
      );
    const user = await this.repository.userByEmail(email);
    const ok =
      (await passwordMatches(
        user,
        parsed.data.password,
        this.config.DEMO_MODE,
      )) &&
      user &&
      canSignIn(user);
    if (!ok) {
      await this.sessions.recordFailure(email);
      throw new ApiError(401, WRONG, 'invalid_credentials');
    }
    // The password is right; the session starts only once the emailed code is entered too.
    const code = signInCode();
    const challengeId = await this.sessions.startChallenge(user, code);
    await this.mailer.send(
      {
        to: user.email,
        subject: `${code} is your CPI Platform sign-in code`,
        idempotencyKey: `signin:${challengeId}`,
        email: createElement(SignInCodeEmail, {
          displayName: user.displayName,
          code,
          minutes: CODE_TTL_MS / 60_000,
        }),
      },
      'We could not email your sign-in code. Try again in a few minutes.',
    );
    return {
      challenge: {
        challengeId,
        expiresAt: toNairobi(new Date(Date.now() + CODE_TTL_MS)),
      },
    };
  }

  /** The second step of password sign-in: the code emailed for the challenge. */
  async verifyCode(input: z.infer<typeof signInCodeSchema>): Promise<User> {
    const outcome = await this.sessions.completeChallenge(
      input.challengeId,
      input.code,
    );
    if (outcome.result === 'wrong') {
      await this.sessions.recordFailure(outcome.email);
      throw new ApiError(
        401,
        'That code is not right. Check the latest email and try again.',
        'invalid_code',
        { code: 'That code is not right.' },
      );
    }
    const user =
      outcome.result === 'ok'
        ? await this.repository.user(outcome.userId)
        : undefined;
    if (!user || !canSignIn(user))
      throw new ApiError(
        410,
        'This code has expired. Sign in again to get a new one.',
        'code_expired',
      );
    await this.sessions.clearFailures(user.email.toLowerCase());
    await write(this.db, (tx, businessTime) =>
      this.events.audit(
        tx,
        businessTime,
        user,
        'session.sign_in',
        { type: 'user', id: user.id },
        'Password and emailed code sign-in',
      ),
    );
    return user;
  }

  /** Always the same answer, so the form cannot be used to find accounts. */
  async requestReset(
    input: z.infer<typeof passwordResetRequestSchema>,
  ): Promise<{ message: string }> {
    const email = input.email.toLowerCase();
    await write(this.db, async (tx, _businessTime, afterCommit) => {
      const user = await this.repository.userByEmail(email, tx);
      if (!user || accountStatus(user) !== 'active') return;
      const link = newLink('reset');
      await this.repository.updateUser(user.id, { authLink: link.stored }, tx);
      afterCommit(() =>
        this.mailer
          .send(
            {
              to: user.email,
              subject: 'Reset your CPI Platform password',
              idempotencyKey: `reset:${link.stored.tokenHash}`,
              email: createElement(PasswordResetEmail, {
                resetUrl: this.mailer.link(`/set-password?token=${link.token}`),
              }),
            },
            '',
          )
          // The answer must not differ by account, so a failure is only logged (by the mailer).
          .catch(() => undefined),
      );
    });
    return {
      message:
        'If an account uses that email, a reset link is on its way. It expires in 1 hour.',
    };
  }

  async token(token: string): Promise<AuthToken> {
    const user = await this.accountForToken(this.db, token);
    return {
      purpose: user.authLink.purpose,
      email: user.email,
      displayName: user.displayName,
      expiresAt: user.authLink.expiresAt,
    };
  }

  /** Sets the password from an invitation or reset link; the body is checked after the link. */
  async setPassword(token: string, body: unknown): Promise<User> {
    const user = await write(this.db, async (tx, businessTime) => {
      const account = await this.accountForToken(tx, token);
      const parsed = setPasswordSchema.safeParse(body);
      const problems = parsed.success
        ? passwordProblems(parsed.data.password, account.email)
        : ['Choose a password.'];
      if (!parsed.success || problems.length)
        throw new ApiError(422, problems.join(' '), 'weak_password', {
          password: problems.join(' '),
        });
      const invitation = account.authLink.purpose === 'invitation';
      const updated = await this.repository.updateUser(
        account.id,
        {
          passwordHash: await hashPassword(parsed.data.password),
          passwordExpiresAt: null,
          authLink: null,
        },
        tx,
      );
      await this.events.audit(
        tx,
        businessTime,
        updated,
        invitation ? 'account.activate' : 'account.password_reset',
        { type: 'user', id: account.id },
        invitation
          ? 'Invitation accepted; password set'
          : 'Password reset by email link',
      );
      return updated;
    });
    await this.sessions.clearFailures(user.email.toLowerCase());
    return user;
  }

  async toSession(user: User): Promise<Session> {
    const { state, cycle, profile } = await currentState(this.db);
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        ...(user.institutionId ? { institutionId: user.institutionId } : {}),
        ...(user.jobTitle ? { jobTitle: user.jobTitle } : {}),
        ...(user.passwordExpiresAt
          ? { mustChangePassword: true as const }
          : {}),
      },
      clock: {
        runId: state.runId,
        businessTime: state.businessTime,
        timezone: cycle.timezone,
      },
      profile: {
        id: profile.id,
        name: profile.name,
        simulation: profile.simulation,
      },
    };
  }

  /** The account a single-use link belongs to, if the link is current. */
  private async accountForToken(db: Db, token: string) {
    const user = await this.repository.userByLinkHash(hashToken(token), db);
    if (!user?.authLink || !user.active)
      throw new ApiError(
        404,
        'This link is not valid. It may already have been used.',
        'link_invalid',
      );
    if (Date.parse(user.authLink.expiresAt) < Date.now())
      throw new ApiError(
        410,
        'This link has expired. Ask for a new one.',
        'link_expired',
      );
    return { ...user, authLink: user.authLink };
  }
}
