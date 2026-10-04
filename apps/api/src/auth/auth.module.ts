import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AuthRepository } from './auth.repository';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { AuthGuard, Sessions } from './sessions';

@Module({
  controllers: [SessionController, AccountController],
  providers: [
    Sessions,
    SessionService,
    AccountService,
    AuthRepository,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [Sessions],
})
export class AuthModule {}
