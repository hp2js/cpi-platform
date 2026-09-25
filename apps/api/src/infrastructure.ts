import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import Redis from 'ioredis';
import type { ReadinessResponse } from '@cpi/contracts';
import { CONFIG, type AppConfig } from './config';
import { errorCode } from './http/diagnostics';

@Injectable()
export class Infrastructure implements OnApplicationShutdown {
  private readonly logger = new Logger('Infrastructure');
  private readonly lastErrors = new Map<
    string,
    { code: string; time: number }
  >();
  private readonly pool: Pool;
  readonly database;
  private readonly redis: Redis;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      connectionTimeoutMillis: 1500,
      query_timeout: 1500,
      max: 10,
    });
    this.pool.on('error', (error) => this.reportFailure('database', error));
    this.database = drizzle(this.pool);
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1500,
      commandTimeout: 1500,
      retryStrategy: () => 1000,
    });
    this.redis.on('error', (error: unknown) =>
      this.reportFailure('redis', error),
    );
    void this.redis.connect().catch(() => undefined);
  }

  async readiness(): Promise<ReadinessResponse> {
    const results = await Promise.allSettled([
      this.database.execute(sql`select 1`),
      this.redis.ping(),
    ]);
    for (const [index, result] of results.entries()) {
      const service = index === 0 ? 'database' : 'redis';
      if (result.status === 'rejected')
        this.reportFailure(service, result.reason);
      else if (this.lastErrors.delete(service))
        this.logger.log({ event: 'dependency.recovered', service });
    }
    const services: ReadinessResponse['services'] = {
      database: results[0]?.status === 'fulfilled' ? 'up' : 'down',
      redis: results[1]?.status === 'fulfilled' ? 'up' : 'down',
    };
    return {
      status: Object.values(services).every((value) => value === 'up')
        ? 'ok'
        : 'degraded',
      services,
    };
  }

  private reportFailure(service: string, error: unknown) {
    const code = errorCode(error);
    const previous = this.lastErrors.get(service);
    if (previous?.code === code && Date.now() - previous.time < 30_000) return;
    this.lastErrors.set(service, { code, time: Date.now() });
    this.logger.warn({ event: 'dependency.failure', service, code });
  }

  async onApplicationShutdown() {
    this.redis.disconnect();
    await this.pool.end();
  }
}
