import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { CONFIG, type AppConfig } from '../config';
import { write } from '../database/db';
import { deliveries, toNairobi } from '../database/schema';
import { Infrastructure } from '../infrastructure';
import { attemptDelivery } from './events';

const POLL_MS = 1000;

/**
 * The single delivery worker (HP2-43): polls the PostgreSQL outbox and attempts each due email
 * in its own write transaction, after the business change that queued it has committed, so a
 * failed delivery or a crashed worker can never undo a business record. Rows are the durable
 * queue: anything still queued or retrying is picked up again after a restart.
 * ponytail: runs in every API process; the in-transaction recheck keeps replicas from
 * attempting a row twice, at the cost of each replica polling.
 */
@Injectable()
export class DeliveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('DeliveryWorker');
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private failing = false;

  constructor(
    private readonly infrastructure: Infrastructure,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.running ??= this.run().finally(() => (this.running = undefined));
    }, POLL_MS);
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  /**
   * Attempts every due delivery until none is left. `ignoreSchedule` also takes retries that are
   * waiting for their backoff (development control).
   */
  async run(ignoreSchedule = false) {
    try {
      for (;;) {
        const due = await this.infrastructure.database
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(this.due(ignoreSchedule))
          .orderBy(asc(deliveries.seq))
          .limit(50);
        if (!due.length) break;
        for (const { id } of due) await this.attempt(id, ignoreSchedule);
      }
      if (this.failing) this.logger.log({ event: 'delivery.worker_recovered' });
      this.failing = false;
    } catch (error) {
      // Outages are reported by readiness; log once per failure streak, without message content.
      if (!this.failing)
        this.logger.warn({
          event: 'delivery.worker_failed',
          code: (error as { code?: unknown }).code ?? 'unknown',
        });
      this.failing = true;
    }
  }

  private due(ignoreSchedule: boolean) {
    const pending = inArray(deliveries.status, ['queued', 'retrying']);
    return ignoreSchedule
      ? pending
      : and(
          pending,
          or(
            isNull(deliveries.nextAttemptAt),
            lte(deliveries.nextAttemptAt, toNairobi(new Date())),
          ),
        );
  }

  private attempt(id: string, ignoreSchedule: boolean) {
    return write(this.infrastructure.database, async (tx, businessTime) => {
      // Recheck under the write lock: another worker or a manual retry may have taken it.
      const [delivery] = await tx
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.id, id), this.due(ignoreSchedule)));
      if (!delivery) return;
      const delay = this.config.DELIVERY_RETRY_DELAYS_MS[delivery.attempts];
      await attemptDelivery(
        tx,
        businessTime,
        delivery,
        delay === undefined ? null : toNairobi(new Date(Date.now() + delay)),
      );
    });
  }
}
