import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import {
  advanceRequestSchema,
  type ScenarioResult,
  type SimulationState,
} from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import { write, type Db } from '../database/db';
import { loadFixtures, seedOptions } from '../database/fixtures';
import { Mailer } from '../email/mailer';
import {
  cycles,
  formVersions,
  processedEvents,
  scoringProfiles,
} from '../database/schema';
import { currentState } from '../database/state';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { advanceTo, boundaryState } from './clock';
import { runScenario } from './scenario';

async function state(db: Db): Promise<SimulationState> {
  const { state: current } = await currentState(db);
  const [processed] = await db
    .select({ count: count() })
    .from(processedEvents)
    .where(eq(processedEvents.runId, current.runId));
  return {
    runId: current.runId,
    businessTime: current.businessTime,
    boundaries: await boundaryState(db),
    processedEvents: processed?.count ?? 0,
  };
}

/** The demo clock, simulation runs, scripted year and officer assignments (FR01, FR14, AT22). */
@Controller()
export class SimulationController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
    private readonly mailer: Mailer,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  /** A new run and the scripted year replace or need the fictional data: demo mode only. */
  private requireDemo() {
    if (!this.config.DEMO_MODE)
      throw new ApiError(
        409,
        'This deployment holds real records, so the simulation cannot reset or script the year.',
        'demo_only',
      );
  }

  private get db() {
    return this.infrastructure.database;
  }

  @Get('simulation')
  simulation() {
    return state(this.db);
  }

  @Post('simulation/advance')
  @HttpCode(200)
  @Roles('administrator')
  advance(@CurrentUser() user: User, @Body() body: unknown) {
    return write(this.db, async (tx) => {
      const parsed = advanceRequestSchema.safeParse(body);
      const boundary = parsed.success
        ? (await boundaryState(tx)).find(
            (candidate) => candidate.id === parsed.data.boundaryId,
          )
        : undefined;
      if (!boundary) throw notFound();
      if (boundary.passed) return state(tx);
      await advanceTo(tx, this.events, boundary.at);
      const { state: current } = await currentState(tx);
      await this.events.audit(
        tx,
        current.businessTime,
        user,
        'simulation.advance',
        { type: 'simulation', id: current.runId },
        `Advanced to ${boundary.label}`,
      );
      return state(tx);
    });
  }

  /** A new run with fresh fixtures; it never touches another run or a real environment (AT24). */
  @Post('simulation/reset')
  @HttpCode(200)
  @Roles('administrator')
  async reset(
    @CurrentUser() user: User,
    @Body() body: { profileId?: unknown } | undefined,
  ) {
    this.requireDemo();
    const profileId =
      typeof body?.profileId === 'string' ? body.profileId : undefined;
    const [chosen] = profileId
      ? await this.db
          .select()
          .from(scoringProfiles)
          .where(eq(scoringProfiles.id, profileId))
      : [];
    if (profileId && chosen?.status !== 'approved')
      throw new ApiError(
        409,
        'A new run can only start with an approved profile.',
        'profile_not_approved',
      );
    const previous = (await currentState(this.db)).state.runId;
    const next = `run-${String(Number(previous.replace(/\D/g, '')) + 1).padStart(3, '0')}`;
    // Settings carry over: the profile library is kept, and a chosen profile applies (§7.1).
    await loadFixtures(this.db, {
      ...seedOptions(this.config, this.mailer),
      keepProfiles: true,
      runId: next,
    });
    return write(this.db, async (tx, businessTime) => {
      if (chosen) {
        await tx.update(cycles).set({ profileId: chosen.id });
        await tx.update(formVersions).set({ weights: { ...chosen.weights } });
      }
      await this.events.audit(
        tx,
        businessTime,
        user,
        'simulation.reset',
        { type: 'simulation', id: next },
        `Started ${next}, replacing ${previous}${chosen ? `, with ${chosen.name}` : ''}`,
      );
      return state(tx);
    });
  }

  @Post('simulation/scenario')
  @HttpCode(200)
  @Roles('administrator')
  async scenario(): Promise<ScenarioResult> {
    this.requireDemo();
    try {
      return await runScenario(
        this.db,
        this.events,
        `http://127.0.0.1:${this.config.API_PORT}/api`,
      );
    } catch (error) {
      // Steps already committed stay; running the scenario again resumes where it stopped.
      throw new ApiError(
        409,
        error instanceof Error
          ? error.message
          : 'The scenario stopped unexpectedly.',
        'scenario_failed',
      );
    }
  }
}
