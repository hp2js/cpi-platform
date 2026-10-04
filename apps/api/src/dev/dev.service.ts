import { Inject, Injectable } from '@nestjs/common';
import { Sessions } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Database } from '../database/db';
import { loadFixtures, seedOptions } from '../database/fixtures';
import { Mailer } from '../email/mailer';
import { DeliveryWorker } from '../events/delivery-worker';
import { DevRepository } from './dev.repository';

@Injectable()
export class DevService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly repository: DevRepository,
    private readonly sessions: Sessions,
    private readonly mailer: Mailer,
    private readonly worker: DeliveryWorker,
  ) {}

  /** Restores the fixtures and clears sign-in lockouts, like the mock's reset. */
  async reset(): Promise<{ runId: string }> {
    await loadFixtures(this.db, seedOptions(this.config, this.mailer));
    await this.sessions.clearAllFailures();
    return { runId: 'run-001' };
  }

  async emailFailure(): Promise<{ enabled: boolean }> {
    return { enabled: await this.repository.emailFailureMode() };
  }

  async setEmailFailure(enabled: boolean): Promise<{ enabled: boolean }> {
    await this.repository.setEmailFailureMode(enabled);
    return { enabled };
  }

  runDeliveries(): Promise<void> {
    return this.worker.run(true);
  }
}
