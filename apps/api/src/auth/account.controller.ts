import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import {
  accountUpdateSchema,
  changePasswordSchema,
  type Account,
} from '@cpi/contracts';
import type { z } from 'zod';
import { ApiError } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { AccountService, wrongCurrentPassword } from './account.service';
import { CurrentUser, TemporaryPasswordAllowed, type User } from './sessions';

/** My account: name, job title, phone and password (PRD §13.1). */
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  @TemporaryPasswordAllowed()
  get(@CurrentUser() user: User): Promise<Account> {
    return this.account.get(user);
  }

  @Put()
  update(
    @CurrentUser() user: User,
    @Body(
      new SchemaValidationPipe(
        accountUpdateSchema,
        (error) =>
          new ApiError(
            422,
            'Some details need attention.',
            'invalid_account',
            Object.fromEntries(
              error.issues.map((issue) => [
                issue.path.join('.'),
                issue.message,
              ]),
            ),
          ),
      ),
    )
    input: z.infer<typeof accountUpdateSchema>,
  ): Promise<Account> {
    return this.account.update(user, input);
  }

  /** Also how a person replaces their emailed temporary password, which ends that state. */
  @Post('password')
  @HttpCode(204)
  @TemporaryPasswordAllowed()
  changePassword(
    @CurrentUser() user: User,
    @Body(new SchemaValidationPipe(changePasswordSchema, wrongCurrentPassword))
    input: z.infer<typeof changePasswordSchema>,
  ): Promise<void> {
    return this.account.changePassword(user, input);
  }
}
