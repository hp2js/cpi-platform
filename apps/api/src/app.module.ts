import { Module, type INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { AdminModule } from './admin/admin.module';
import { AssistantModule } from './assistant/assistant.module';
import { AnnualModule } from './annual/annual.module';
import { AuthModule } from './auth/auth.module';
import { CycleModule } from './cycle/cycle.module';
import { DevModule } from './dev/dev.module';
import { DirectoryModule } from './directory/directory.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health.module';
import { bodyParsers } from './http/body-parsers';
import { requestContext } from './http/diagnostics';
import { ApiExceptionFilter } from './http/errors.filter';
import { InfrastructureModule } from './infrastructure.module';
import { PlanningModule } from './planning/planning.module';
import { ReportingModule } from './reporting/reporting.module';
import { ReviewModule } from './review/review.module';
import { SimulationModule } from './simulation/simulation.module';
import { SupervisionModule } from './supervision/supervision.module';

@Module({
  imports: [
    InfrastructureModule,
    HealthModule,
    AuthModule,
    DirectoryModule,
    CycleModule,
    ReportingModule,
    ReviewModule,
    AssistantModule,
    PlanningModule,
    AnnualModule,
    EventsModule,
    SimulationModule,
    SupervisionModule,
    AdminModule,
    DevModule,
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
