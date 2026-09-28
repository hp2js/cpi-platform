import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  signInRequestSchema,
  type AuthConfig,
  type DemoAccount,
  type Session,
} from '@cpi/contracts';
import { currentState } from '../database/state';
import { institutions, users } from '../database/schema';
import { CONFIG, type AppConfig } from '../config';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { CurrentUser, Public, Sessions, type User } from './sessions';

@Controller()
export class SessionController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly sessions: Sessions,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** How people can sign in on this deployment. */
  @Public()
  @Get('auth/config')
  authConfig(): AuthConfig {
    return {
      // ponytail: password sign-in, invitations and resets are the next step (HP2-13).
      passwordSignIn: false,
      demoAccounts: this.config.DEMO_MODE,
      demoPassword: null,
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

  /** Demo mode only: the fictional accounts for one-click sign-in. */
  @Public()
  @Get('demo/accounts')
  async accounts(): Promise<DemoAccount[]> {
    if (!this.config.DEMO_MODE) throw notFound();
    const rows = await this.infrastructure.database
      .select({ user: users, institutionName: institutions.name })
      .from(users)
      .leftJoin(institutions, eq(institutions.id, users.institutionId))
      .where(eq(users.active, true))
      .orderBy(asc(users.id));
    return rows.map(({ user, institutionName }) => ({
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
    const parsed = signInRequestSchema.safeParse(body);
    if (parsed.success && 'accountId' in parsed.data && !this.config.DEMO_MODE)
      throw new ApiError(
        422,
        'Demo sign-in is not available on this deployment.',
        'demo_disabled',
      );
    // ponytail: demo sign-in only; password sign-in, invitations and resets are a follow-up.
    if (parsed.success && !('accountId' in parsed.data))
      throw new ApiError(
        422,
        'Password sign-in is not available on this server yet. Use a demo account.',
        'password_sign_in_unavailable',
      );
    const accountId =
      parsed.success && 'accountId' in parsed.data
        ? parsed.data.accountId
        : undefined;
    const [user] = accountId
      ? await this.infrastructure.database
          .select()
          .from(users)
          .where(and(eq(users.id, accountId), eq(users.active, true)))
      : [];
    if (!user)
      throw new ApiError(
        422,
        'Choose an active demo account.',
        'invalid_account',
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

  private async toSession(user: User): Promise<Session> {
    const { state, cycle, profile } = await currentState(
      this.infrastructure.database,
    );
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        ...(user.institutionId ? { institutionId: user.institutionId } : {}),
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
