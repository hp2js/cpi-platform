import { Module, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { APP_GUARD } from '@nestjs/core';
import { SessionController } from './auth/session.controller';
import { AuthGuard, Sessions } from './auth/sessions';
import { CONFIG, loadConfig } from './config';
import { FormsController } from './cycle/forms.controller';
import { SettingsController } from './cycle/settings.controller';
import { DirectoryController } from './directory/directory.controller';
import { Events } from './events/events';
import { ReportingController } from './reporting/reporting.controller';
import { HealthController } from './health.controller';
import { bodyParsers } from './http/body-parsers';
import { requestContext } from './http/diagnostics';
import { ApiExceptionFilter } from './http/errors.filter';
import { Infrastructure } from './infrastructure';

@Module({
  controllers: [
    HealthController,
    SessionController,
    DirectoryController,
    FormsController,
    SettingsController,
    ReportingController,
  ],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    Infrastructure,
    Sessions,
    Events,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

/** Middleware, error envelope and `/api` prefix, shared by the server and integration tests. */
export function configureApp(app: INestApplication) {
  app.use(requestContext);
  app.use(helmet());
  app.use(...bodyParsers);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');
}
