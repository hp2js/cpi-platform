import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { PlanningService } from './planning.service';

/**
 * Plan baselines, their approval and amendments (FR04, PRD §10.4, AT17, AT25, AT31). Bodies
 * are validated by the service after scope and assignment checks.
 */
@Controller()
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  /** Plan work waiting on officers in the caller's scope (HP2-52). */
  @Get('planning/work')
  @Roles('officer', 'supervisor', 'administrator')
  work(@CurrentUser() user: User) {
    return this.planning.work(user);
  }

  @Get('institutions/:institutionId/plan')
  plan(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
  ) {
    return this.planning.plan(user, institutionId);
  }

  @Post('baselines/:baselineId/approve')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  approve(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return this.planning.approve(user, id, body);
  }

  @Post('baselines/:baselineId/return')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  returnBaseline(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return this.planning.returnBaseline(user, id, body);
  }

  @Post('baselines/:baselineId/confirm-seed')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  confirmSeed(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return this.planning.confirmSeed(user, id, body);
  }

  @Post('institutions/:institutionId/amendments')
  @Roles('institution')
  requestAmendment(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body() body: unknown,
  ) {
    return this.planning.requestAmendment(user, institutionId, body);
  }

  @Post('amendments/:amendmentId/decision')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  decideAmendment(
    @CurrentUser() user: User,
    @Param('amendmentId') id: string,
    @Body() body: unknown,
  ) {
    return this.planning.decideAmendment(user, id, body);
  }
}
