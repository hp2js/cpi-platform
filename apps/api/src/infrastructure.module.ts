import { Global, Module } from '@nestjs/common';
import { configProvider } from './config';
import { DB } from './database/db';
import { Mailer } from './email/mailer';
import { Events } from './events/events';
import { Infrastructure } from './infrastructure';
import { Files } from './storage/files';
import { Objects } from './storage/objects';

/** Configuration, the database, Redis, file storage, email and the audit/notification writer. */
@Global()
@Module({
  providers: [
    configProvider,
    Objects,
    Infrastructure,
    {
      provide: DB,
      inject: [Infrastructure],
      useFactory: (i: Infrastructure) => i.database,
    },
    Files,
    Mailer,
    Events,
  ],
  exports: [configProvider, Objects, Infrastructure, DB, Files, Mailer, Events],
})
export class InfrastructureModule {}
