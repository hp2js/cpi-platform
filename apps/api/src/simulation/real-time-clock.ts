import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { write } from '../database/db';
import { toNairobi } from '../database/schema';
import { Events } from '../events/events';
import { Infrastructure } from '../infrastructure';
import { advanceTo } from './clock';

const TICK_MS = 1000;

/**
 * Outside demo mode nobody may move the clock, so business time follows the real one: every
 * second it moves to now, processing each boundary passed (reporting opens, reminders, overdue
 * notices) exactly once, as an administrator's advance does in the demonstration.
 * ponytail: one tiny write per second per API process; schedule the next boundary instead if
 * that ever shows up in write latency.
 */
@Injectable()
export class RealTimeClock
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('RealTimeClock');
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private failing = false;

  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (this.config.DEMO_MODE) return; // The demonstration's clock moves only when advanced.
    this.timer = setInterval(() => {
      this.running ??= this.tick().finally(() => (this.running = undefined));
    }, TICK_MS);
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  async tick() {
    try {
      await write(this.infrastructure.database, async (tx, businessTime) => {
        const now = toNairobi(new Date());
        if (Date.parse(now) > Date.parse(businessTime))
          await advanceTo(tx, this.events, now);
      });
      this.failing = false;
    } catch (error) {
      // Outages are reported by readiness; log once per failure streak.
      if (!this.failing)
        this.logger.warn({
          event: 'clock.tick_failed',
          code: (error as { code?: unknown }).code ?? 'unknown',
        });
      this.failing = true;
    }
  }
}
