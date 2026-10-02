import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { createElement } from 'react';
import { asc, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  demoSignInSchema,
  passwordProblems,
  passwordResetRequestSchema,
  passwordSignInSchema,
  setPasswordSchema,
  signInCodeSchema,
  type AuthConfig,
  type AuthToken,
  type DemoAccount,
  type Session,
  type SignInChallenge,
} from '@cpi/contracts';
import { CONFIG, type AppConfig } from '../config';
import { write, type Db } from '../database/db';
import { institutions, toNairobi, users } from '../database/schema';
import { currentState } from '../database/state';
import { Mailer } from '../email/mailer';
import { PasswordResetEmail, SignInCodeEmail } from '../email/templates';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
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
import {
  CODE_TTL_MS,
  CurrentUser,
  Public,
  Sessions,
  TemporaryPasswordAllowed,
  type User,
} from './sessions';

/** One message for every failure, so the form never reveals which emails have accounts. */
const WRONG = 'The email or password is not right. Check both and try again.';

/** The account a single-use link belongs to, if the link is current. */
async function accountForToken(db: Db, token: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`${users.authLink} ->> 'tokenHash' = ${hashToken(token)}`);
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

/** Sign-in (password, then an emailed code), sessions, password resets and links (PRD §13.1, HP2-13). */
@Controller()
export class SessionController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly sessions: Sessions,
    private readonly events: Events,
    private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /** How people can sign in on this deployment. */
  @Public()
  @Get('auth/config')
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
  @Public()
  @Get('demo/accounts')
  async accounts(): Promise<DemoAccount[]> {
    if (!this.config.DEMO_MODE) throw notFound();
    const rows = await this.db
      .select({ user: users, institutionName: institutions.name })
      .from(users)
      .leftJoin(institutions, eq(institutions.id, users.institutionId))
      .orderBy(asc(users.id));
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

  @Get('session')
  @TemporaryPasswordAllowed()
  session(@CurrentUser() user: User) {
    return this.toSession(user);
  }

  @Public()
  @Post('session')
  @HttpCode(200)
  async signIn(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const demo = demoSignInSchema.safeParse(body);
    if (demo.success) {
      if (!this.config.DEMO_MODE)
        throw new ApiError(
          422,
          'Demo sign-in is not available on this deployment.',
          'demo_disabled',
        );
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, demo.data.accountId));
      if (!user || accountStatus(user) !== 'active')
        throw new ApiError(
          422,
          'Choose an active demo account.',
          'invalid_account',
        );
      await this.sessions.start(response, user.id);
      return this.toSession(user);
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
    const [user] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
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
    response.status(202);
    return {
      challengeId,
      expiresAt: toNairobi(new Date(Date.now() + CODE_TTL_MS)),
    } satisfies SignInChallenge;
  }

  /** The second step of password sign-in: the code emailed for the challenge. */
  @Public()
  @Post('session/code')
  @HttpCode(200)
  async verifyCode(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = signInCodeSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(
        422,
        'Enter the 6-digit code from the email.',
        'invalid_request',
        { code: 'Enter the 6-digit code from the email.' },
      );
    const outcome = await this.sessions.completeChallenge(
      parsed.data.challengeId,
      parsed.data.code,
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
    const [user] =
      outcome.result === 'ok'
        ? await this.db.select().from(users).where(eq(users.id, outcome.userId))
        : [];
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
    await this.sessions.start(response, user.id);
    return this.toSession(user);
  }

  @Public()
  @Delete('session')
  @HttpCode(204)
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.end(request, response);
  }

  /** Always the same answer, so the form cannot be used to find accounts. */
  @Public()
  @Post('auth/password-reset')
  @HttpCode(202)
  async requestReset(@Body() body: unknown) {
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new ApiError(422, 'Enter your email.', 'invalid_request', {
        email: 'Enter your email.',
      });
    const email = parsed.data.email.toLowerCase();
    await write(this.db, async (tx, _businessTime, afterCommit) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      if (!user || accountStatus(user) !== 'active') return;
      const link = newLink('reset');
      await tx
        .update(users)
        .set({ authLink: link.stored })
        .where(eq(users.id, user.id));
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

  @Public()
  @Get('auth/tokens/:token')
  async token(@Param('token') token: string): Promise<AuthToken> {
    const user = await accountForToken(this.db, token);
    return {
      purpose: user.authLink.purpose,
      email: user.email,
      displayName: user.displayName,
      expiresAt: user.authLink.expiresAt,
    };
  }

  /** Sets the password from an invitation or reset link, then signs the person in. */
  @Public()
  @Post('auth/tokens/:token')
  @HttpCode(200)
  async setPassword(
    @Param('token') token: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await write(this.db, async (tx, businessTime) => {
      const account = await accountForToken(tx, token);
      const parsed = setPasswordSchema.safeParse(body);
      const problems = parsed.success
        ? passwordProblems(parsed.data.password, account.email)
        : ['Choose a password.'];
      if (!parsed.success || problems.length)
        throw new ApiError(422, problems.join(' '), 'weak_password', {
          password: problems.join(' '),
        });
      const invitation = account.authLink.purpose === 'invitation';
      const [updated] = await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(parsed.data.password),
          passwordExpiresAt: null,
          authLink: null,
        })
        .where(eq(users.id, account.id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        updated!,
        invitation ? 'account.activate' : 'account.password_reset',
        { type: 'user', id: account.id },
        invitation
          ? 'Invitation accepted; password set'
          : 'Password reset by email link',
      );
      return updated!;
    });
    await this.sessions.clearFailures(user.email.toLowerCase());
    await this.sessions.start(response, user.id);
    return this.toSession(user);
  }

  private async toSession(user: User): Promise<Session> {
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
}
