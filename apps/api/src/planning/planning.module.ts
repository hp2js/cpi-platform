import { Module } from '@nestjs/common';
import { ReportingModule } from '../reporting/reporting.module';
import { FoundationsController } from './foundations.controller';
import { FoundationsRepository } from './foundations.repository';
import { FoundationsService } from './foundations.service';
import { PlanEditorController } from './plan-editor.controller';
import { PlanEditorRepository } from './plan-editor.repository';
import { PlanEditorService } from './plan-editor.service';
import { PlanningController } from './planning.controller';
import { PlanningRepository } from './planning.repository';
import { PlanningService } from './planning.service';

@Module({
  imports: [ReportingModule],
  controllers: [
    PlanningController,
    PlanEditorController,
    FoundationsController,
  ],
  providers: [
    PlanningService,
    PlanningRepository,
    PlanEditorService,
    PlanEditorRepository,
    FoundationsService,
    FoundationsRepository,
  ],
})
export class PlanningModule {}
