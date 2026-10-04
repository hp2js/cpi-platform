import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanEditorController } from './plan-editor.controller';
import { FoundationsController } from './foundations.controller';

@Module({
  controllers: [
    PlanningController,
    PlanEditorController,
    FoundationsController,
  ],
})
export class PlanningModule {}
