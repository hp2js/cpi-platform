import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Sessions } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import { loadFixtures, seedOptions } from '../database/fixtures';
import { Mailer } from '../email/mailer';
import { systemState } from '../database/schema';
import { notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';

/**
 * Development controls for rehearsing recovery paths, on the same paths as the mock API's so
 * the dev toolbar and e2e specs work against either. Never available in production.
 */
@Public()
@Controller('__mock')
export class DevController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly sessions: Sessions,
    private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** The database, or 404 outside development demo deployments. */
  private devDatabase() {
    if (this.config.NODE_ENV === 'production' || !this.config.DEMO_MODE)
      throw notFound();
    return this.infrastructure.database;
  }

  /** Restores the fixtures and signs the caller out, like the mock's reset. */
  @Post('reset')
  @HttpCode(200)
  async reset(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await loadFixtures(
      this.devDatabase(),
      seedOptions(this.config, this.mailer),
    );
    await this.sessions.end(request, response);
    // Sign-in lockouts belong to the data being reset.
    const redis = this.infrastructure.redis;
    const throttles = await redis.keys('login-*');
    if (throttles.length) await redis.del(...throttles);
    return { runId: 'run-001' };
  }

  @Get('email-failure')
  async emailFailure() {
    const [state] = await this.devDatabase()
      .select({ enabled: systemState.emailFailureMode })
      .from(systemState);
    return { enabled: state?.enabled ?? false };
  }

  /** While on, the demo email sink rejects deliveries (AT12). */
  @Post('email-failure')
  @HttpCode(200)
  async setEmailFailure(@Body() body: { enabled?: unknown } | undefined) {
    const enabled = body?.enabled === true;
    await this.devDatabase()
      .update(systemState)
      .set({ emailFailureMode: enabled });
    return { enabled };
  }

  /** The caller's next request gets 401 `session_expired`. */
  @Post('expire-session')
  @HttpCode(204)
  async expire(@Req() request: Request) {
    this.devDatabase();
    await this.sessions.expire(request);
  }
}
