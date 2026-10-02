import { Module, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { APP_GUARD } from '@nestjs/core';
import { AdminController } from './admin/admin.controller';
import { AnnualController } from './annual/annual.controller';
import { DevController } from './dev/dev.controller';
import { AccountController } from './auth/account.controller';
import { SessionController } from './auth/session.controller';
import { AuthGuard, Sessions } from './auth/sessions';
import { CONFIG, loadConfig } from './config';
import { FormsController } from './cycle/forms.controller';
import { SettingsController } from './cycle/settings.controller';
import { DirectoryController } from './directory/directory.controller';
import { EventsController } from './events/events.controller';
import { Mailer } from './email/mailer';
import { Events } from './events/events';
import { FoundationsController } from './planning/foundations.controller';
import { PlanEditorController } from './planning/plan-editor.controller';
import { PlanningController } from './planning/planning.controller';
import { ReportingController } from './reporting/reporting.controller';
import { ReviewController } from './review/review.controller';
import { SimulationController } from './simulation/simulation.controller';
import { SupervisionController } from './supervision/supervision.controller';
import { HealthController } from './health.controller';
import { bodyParsers } from './http/body-parsers';
import { requestContext } from './http/diagnostics';
import { ApiExceptionFilter } from './http/errors.filter';
import { Infrastructure } from './infrastructure';
import { Objects } from './storage/objects';
import { Files } from './storage/files';

@Module({
  controllers: [
    HealthController,
    SessionController,
    AccountController,
    DirectoryController,
    FormsController,
    SettingsController,
    ReportingController,
    ReviewController,
    PlanningController,
    PlanEditorController,
    FoundationsController,
    AnnualController,
    EventsController,
    SimulationController,
    SupervisionController,
    AdminController,
    DevController,
  ],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    Infrastructure,
    Objects,
    Files,
    Sessions,
    Events,
    Mailer,
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
