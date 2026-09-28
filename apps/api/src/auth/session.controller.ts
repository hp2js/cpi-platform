import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import {
  signInRequestSchema,
  type DemoAccount,
  type Session,
} from '@cpi/contracts';
import { currentState } from '../database/state';
import { institutions, users } from '../database/schema';
import { ApiError } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { CurrentUser, Public, Sessions, type User } from './sessions';

@Controller()
export class SessionController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly sessions: Sessions,
  ) {}

  /** Demo-only account picker; must not ship with real authentication (HP2-13). */
  @Public()
  @Get('demo/accounts')
  async accounts(): Promise<DemoAccount[]> {
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
