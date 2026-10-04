import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { AccountController } from './account.controller';
import { AuthGuard, Sessions } from './sessions';
import { APP_GUARD } from '@nestjs/core';

@Module({
  controllers: [SessionController, AccountController],
  providers: [Sessions, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [Sessions],
})
export class AuthModule {}
