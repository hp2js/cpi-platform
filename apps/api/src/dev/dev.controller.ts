import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public, Sessions } from '../auth/sessions';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { DevEnvironmentGuard } from './dev-environment.guard';
import { DevService } from './dev.service';

/** Anything but `{ enabled: true }` turns the failure mode off. */
const emailFailureSchema = z
  .unknown()
  .transform(
    (body) =>
      typeof body === 'object' &&
      body !== null &&
      'enabled' in body &&
      body.enabled === true,
  );

/**
 * Development controls for rehearsing recovery paths, on the same paths as the mock API's so
 * the dev toolbar and e2e specs work against either. Never available in production.
 */
@Public()
@UseGuards(DevEnvironmentGuard)
@Controller('__mock')
export class DevController {
  constructor(
    private readonly dev: DevService,
    private readonly sessions: Sessions,
  ) {}

  /** Restores the fixtures and signs the caller out, like the mock's reset. */
  @Post('reset')
  @HttpCode(200)
  async reset(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ runId: string }> {
    const result = await this.dev.reset();
    await this.sessions.end(request, response);
    return result;
  }

  @Get('email-failure')
  emailFailure(): Promise<{ enabled: boolean }> {
    return this.dev.emailFailure();
  }

  /** While on, the demo email sink rejects deliveries (AT12). */
  @Post('email-failure')
  @HttpCode(200)
  setEmailFailure(
    @Body(new SchemaValidationPipe(emailFailureSchema)) enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    return this.dev.setEmailFailure(enabled);
  }

  /** Attempts every queued or retrying email now, without waiting for its backoff. */
  @Post('deliveries/run')
  @HttpCode(204)
  runDeliveries(): Promise<void> {
    return this.dev.runDeliveries();
  }

  /** The caller's next request gets 401 `session_expired`. */
  @Post('expire-session')
  @HttpCode(204)
  expire(@Req() request: Request): Promise<void> {
    return this.sessions.expire(request);
  }
}
