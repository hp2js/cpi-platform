import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ScenarioResult, SimulationState } from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { DemoEnvironmentGuard } from './demo-environment.guard';
import { SimulationService } from './simulation.service';

/** The demo clock, simulation runs and the scripted year (FR14, AT22, AT24). */
@Controller('simulation')
export class SimulationController {
  constructor(private readonly simulation: SimulationService) {}

  @Get()
  state(): Promise<SimulationState> {
    return this.simulation.simulation();
  }

  @Post('advance')
  @HttpCode(200)
  @Roles('administrator')
  @UseGuards(DemoEnvironmentGuard)
  advance(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<SimulationState> {
    return this.simulation.advance(user, body);
  }

  @Post('reset')
  @HttpCode(200)
  @Roles('administrator')
  @UseGuards(DemoEnvironmentGuard)
  reset(
    @CurrentUser() user: User,
    @Body() body: { profileId?: unknown } | undefined,
  ): Promise<SimulationState> {
    return this.simulation.reset(user, body?.profileId);
  }

  @Post('scenario')
  @HttpCode(200)
  @Roles('administrator')
  @UseGuards(DemoEnvironmentGuard)
  scenario(): Promise<ScenarioResult> {
    return this.simulation.scenario();
  }
}
