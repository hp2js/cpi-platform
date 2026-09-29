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
import { asc, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  demoSignInSchema,
  passwordProblems,
  passwordResetRequestSchema,
  passwordSignInSchema,
  setPasswordSchema,
  type AuthConfig,
  type AuthToken,
  type DemoAccount,
  type Session,
} from '@cpi/contracts';
import { CONFIG, type AppConfig } from '../config';
import { write, type Db } from '../database/db';
import { institutions, users } from '../database/schema';
import { currentState } from '../database/state';
import { Events, sendEmail } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import {
  DEMO_PASSWORD,
  accountStatus,
  hashPassword,
  hashToken,
  newLink,
  passwordMatches,
} from './passwords';
import { CurrentUser, Public, Sessions, type User } from './sessions';

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

/** Sign-in, sessions, password resets and invitation links (PRD §13.1, HP2-13). */
@Controller()
export class SessionController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly sessions: Sessions,
    private readonly events: Events,
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
      accountStatus(user) === 'active';
    if (!ok) {
      await this.sessions.recordFailure(email);
      throw new ApiError(401, WRONG, 'invalid_credentials');
    }
    await this.sessions.clearFailures(email);
    await write(this.db, (tx, businessTime) =>
      this.events.audit(
        tx,
        businessTime,
        user,
        'session.sign_in',
        { type: 'user', id: user.id },
        'Password sign-in',
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
    await write(this.db, async (tx, businessTime) => {
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
      await sendEmail(
        tx,
        businessTime,
        this.config.PORTAL_URL,
        `reset:${user.id}:${link.stored.tokenHash.slice(0, 12)}`,
        'account.password_reset',
        user,
        {
          subject: 'Reset your CPI Platform password',
          body: 'Someone asked to reset the password for this account. If it was you, choose a new password with this link; it works once and expires in 1 hour. Otherwise you can ignore this email.',
          link: `/set-password?token=${link.token}`,
        },
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
