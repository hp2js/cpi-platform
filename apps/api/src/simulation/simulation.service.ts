import { Inject, Injectable } from '@nestjs/common';
import {
  advanceRequestSchema,
  type ScenarioResult,
  type SimulationState,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { CONFIG, demoEnvironment, type AppConfig } from '../config';
import { DB, write, type Database, type Db } from '../database/db';
import { loadFixtures, seedOptions } from '../database/fixtures';
import { currentState } from '../database/state';
import { Mailer } from '../email/mailer';
import { Events } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { advanceTo, boundaryState } from './clock';
import { runScenario } from './scenario';
import { SettingsRepository } from '../cycle/settings.repository';
import { SimulationRepository } from './simulation.repository';

/** The demo clock, simulation runs and the scripted year (FR14). */
@Injectable()
export class SimulationService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly repository: SimulationRepository,
    private readonly settings: SettingsRepository,
    private readonly events: Events,
    private readonly mailer: Mailer,
  ) {}

  simulation(): Promise<SimulationState> {
    return this.state(this.db);
  }

  /** An unknown or malformed boundary is 404; one already passed changes nothing. */
  advance(user: User, body: unknown): Promise<SimulationState> {
    return write(this.db, async (tx) => {
      const parsed = advanceRequestSchema.safeParse(body);
      const boundary = parsed.success
        ? (await boundaryState(tx)).find(
            (candidate) => candidate.id === parsed.data.boundaryId,
          )
        : undefined;
      if (!boundary) throw notFound();
      if (boundary.passed) return this.state(tx);
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
      return this.state(tx);
    });
  }

  /**
   * A new run with fresh fixtures, replacing the current one on the demo database (AT24). Only
   * one run exists at a time; earlier runs are not kept.
   */
  async reset(user: User, requested: unknown): Promise<SimulationState> {
    const profileId = typeof requested === 'string' ? requested : undefined;
    const chosen = profileId
      ? await this.settings.profile(profileId)
      : undefined;
    if (profileId && chosen?.status !== 'approved')
      throw new ApiError(
        409,
        'A new run can only start with an approved profile.',
        'profile_not_approved',
      );
    // Kept: the profile library, a chosen profile (§7.1) and the configured administrator.
    // Everything else, the calendar and forms included, returns to the fixture the scripted
    // year depends on. The reset holds the write lock and records itself in one transaction.
    let replaced = 'run-000';
    await loadFixtures(this.db, {
      ...seedOptions(this.config, this.mailer),
      keepProfiles: true,
      runId: (previous = replaced) => {
        replaced = previous;
        return `run-${String(Number(previous.replace(/\D/g, '')) + 1).padStart(3, '0')}`;
      },
      then: async (tx, businessTime) => {
        if (chosen) await this.repository.applyProfile(chosen, tx);
        const { state: started } = await currentState(tx);
        await this.events.audit(
          tx,
          businessTime,
          user,
          'simulation.reset',
          { type: 'simulation', id: started.runId },
          `Started ${started.runId}, replacing ${replaced}${chosen ? `, with ${chosen.name}` : ''}`,
        );
      },
    });
    return this.state(this.db);
  }

  async scenario(): Promise<ScenarioResult> {
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

  private async state(db: Db): Promise<SimulationState> {
    const { state: current } = await currentState(db);
    return {
      runId: current.runId,
      businessTime: current.businessTime,
      boundaries: await boundaryState(db),
      processedEvents: await this.repository.processedEventCount(
        current.runId,
        db,
      ),
      controls: demoEnvironment(this.config),
    };
  }
}
