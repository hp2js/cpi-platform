import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  activityRequestSchema,
  issueMessages,
  planApprovalRequestSchema,
  planImportRequestSchema,
  plannedMilestoneRequestSchema,
  proposeBaselineRequestSchema,
  riskRequestSchema,
  type PlanImportResult,
  type ActivityRequest,
  type PlanApprovalRequest,
  type PlanImportRequest,
  type PlannedMilestoneRequest,
  type ProposeBaselineRequest,
  type RiskRequest,
} from '@cpi/contracts';
import type { z } from 'zod';
import { OwnInstitutionGuard } from '../auth/own-institution.guard';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { ApiError } from '../http/api-error';
import { SchemaValidationPipe } from '../http/validation.pipe';
import { PlanEditorService } from './plan-editor.service';

/** Every plan body fails the same way: one message, a message per field. */
const plan = <T>(schema: z.ZodType<T>) =>
  new SchemaValidationPipe(
    schema,
    (error) =>
      new ApiError(
        422,
        'Some values need attention.',
        'invalid_plan',
        issueMessages(error),
      ),
  );

/**
 * The institution maintains its own plan (FR04): the approval record, risks, activities and
 * quarterly milestones, and proposes each quarter's baseline from them.
 */
@Controller('institutions/:institutionId')
@Roles('institution')
@UseGuards(OwnInstitutionGuard)
export class PlanEditorController {
  constructor(private readonly editor: PlanEditorService) {}

  @Put('plan/approval')
  approval(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body(plan(planApprovalRequestSchema))
    input: PlanApprovalRequest,
  ) {
    return this.editor.approval(user, institutionId, input);
  }

  @Post('risks')
  addRisk(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body(plan(riskRequestSchema)) input: RiskRequest,
  ) {
    return this.editor.addRisk(user, institutionId, input);
  }

  @Put('risks/:riskId')
  updateRisk(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('riskId') riskId: string,
    @Body(plan(riskRequestSchema)) input: RiskRequest,
  ) {
    return this.editor.updateRisk(user, institutionId, riskId, input);
  }

  @Delete('risks/:riskId')
  removeRisk(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('riskId') riskId: string,
  ) {
    return this.editor.removeRisk(user, institutionId, riskId);
  }

  @Post('activities')
  addActivity(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body(plan(activityRequestSchema))
    input: ActivityRequest,
  ) {
    return this.editor.addActivity(user, institutionId, input);
  }

  @Put('activities/:activityId')
  updateActivity(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('activityId') activityId: string,
    @Body(plan(activityRequestSchema))
    input: ActivityRequest,
  ) {
    return this.editor.updateActivity(user, institutionId, activityId, input);
  }

  @Delete('activities/:activityId')
  removeActivity(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.editor.removeActivity(user, institutionId, activityId);
  }

  @Post('plan-milestones')
  addMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body(plan(plannedMilestoneRequestSchema))
    input: PlannedMilestoneRequest,
  ) {
    return this.editor.addMilestone(user, institutionId, input);
  }

  @Put('plan-milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('milestoneId') milestoneId: string,
    @Body(plan(plannedMilestoneRequestSchema))
    input: PlannedMilestoneRequest,
  ) {
    return this.editor.updateMilestone(user, institutionId, milestoneId, input);
  }

  @Delete('plan-milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return this.editor.removeMilestone(user, institutionId, milestoneId);
  }

  /** Copies the quarter's planned milestones, with both committee meetings, into a new version. */
  @Post('baselines/:periodId/propose')
  propose(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Param('periodId') periodId: string,
    @Body(plan(proposeBaselineRequestSchema))
    input: ProposeBaselineRequest,
  ) {
    return this.editor.propose(user, institutionId, periodId, input);
  }

  @Post('plan/import/preview')
  @HttpCode(200)
  importPreview(
    @Param('institutionId') institutionId: string,
    @Body(plan(planImportRequestSchema))
    input: PlanImportRequest,
  ) {
    return this.editor.importPreview(institutionId, input);
  }

  /** All or nothing, like the institution import: fix the file and run it again. */
  @Post('plan/import')
  @HttpCode(200)
  import(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body(plan(planImportRequestSchema))
    input: PlanImportRequest,
  ): Promise<PlanImportResult> {
    return this.editor.import(user, institutionId, input);
  }
}
