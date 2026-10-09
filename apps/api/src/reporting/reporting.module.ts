import { Module } from '@nestjs/common';
import { AssistantModule } from '../assistant/assistant.module';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';

@Module({
  imports: [AssistantModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingRepository],
  exports: [ReportingRepository],
})
export class ReportingModule {}
