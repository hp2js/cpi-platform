import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, ReportingRepository],
})
export class ReportingModule {}
