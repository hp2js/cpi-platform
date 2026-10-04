import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  passwordResetRequestSchema,
  signInCodeSchema,
  type AuthConfig,
  type AuthToken,
  type DemoAccount,
  type Session,
  type SignInChallenge,
  type PasswordResetRequest,
  type SignInCode,
} from '@cpi/contracts';
import { invalidBody } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { SessionService } from './session.service';
import {
  CurrentUser,
  Public,
  Sessions,
  TemporaryPasswordAllowed,
  type User,
} from './sessions';

/**
 * Sign-in (password, then an emailed code), sessions, password resets and links (PRD §13.1,
 * HP2-13). The controller owns the session cookie; everything else is in SessionService.
 */
@Controller()
export class SessionController {
  constructor(
    private readonly auth: SessionService,
    private readonly sessions: Sessions,
  ) {}

  /** How people can sign in on this deployment. */
  @Public()
  @Get('auth/config')
  authConfig(): AuthConfig {
    return this.auth.authConfig();
  }

  /** Demo mode only: fictional accounts that have finished setting up. */
  @Public()
  @Get('demo/accounts')
  accounts(): Promise<DemoAccount[]> {
    return this.auth.demoAccounts();
  }

  @Get('session')
  @TemporaryPasswordAllowed()
  session(@CurrentUser() user: User): Promise<Session> {
    return this.auth.toSession(user);
  }

  /** 200 with a session for a demo account; 202 with a challenge once a code is emailed. */
  @Public()
  @Post('session')
  @HttpCode(200)
  async signIn(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session | SignInChallenge> {
    const result = await this.auth.signIn(body);
    if ('challenge' in result) {
      response.status(202);
      return result.challenge;
    }
    return this.startSession(response, result.user);
  }

  /** The second step of password sign-in: the code emailed for the challenge. */
  @Public()
  @Post('session/code')
  @HttpCode(200)
  async verifyCode(
    @Body(
      new SchemaValidationPipe(
        signInCodeSchema,
        invalidBody('Enter the 6-digit code from the email.', {
          code: 'Enter the 6-digit code from the email.',
        }),
      ),
    )
    input: SignInCode,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session> {
    return this.startSession(response, await this.auth.verifyCode(input));
  }

  @Public()
  @Delete('session')
  @HttpCode(204)
  signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    return this.sessions.end(request, response);
  }

  /** Always the same answer, so the form cannot be used to find accounts. */
  @Public()
  @Post('auth/password-reset')
  @HttpCode(202)
  requestReset(
    @Body(
      new SchemaValidationPipe(
        passwordResetRequestSchema,
        invalidBody('Enter your email.', { email: 'Enter your email.' }),
      ),
    )
    input: PasswordResetRequest,
  ): Promise<{ message: string }> {
    return this.auth.requestReset(input);
  }

  @Public()
  @Get('auth/tokens/:token')
  token(@Param('token') token: string): Promise<AuthToken> {
    return this.auth.token(token);
  }

  /** Sets the password from an invitation or reset link, then signs the person in. */
  @Public()
  @Post('auth/tokens/:token')
  @HttpCode(200)
  async setPassword(
    @Param('token') token: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Session> {
    return this.startSession(
      response,
      await this.auth.setPassword(token, body),
    );
  }

  /** Sets the session cookie and returns the session. */
  private async startSession(response: Response, user: User): Promise<Session> {
    await this.sessions.start(response, user.id);
    return this.auth.toSession(user);
  }
}
