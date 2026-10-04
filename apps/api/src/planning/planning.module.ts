import { Module } from '@nestjs/common';
import { FoundationsController } from './foundations.controller';
import { PlanEditorController } from './plan-editor.controller';
import { PlanEditorRepository } from './plan-editor.repository';
import { PlanEditorService } from './plan-editor.service';
import { PlanningController } from './planning.controller';
import { PlanningRepository } from './planning.repository';
import { PlanningService } from './planning.service';

@Module({
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
  ],
})
export class PlanningModule {}
