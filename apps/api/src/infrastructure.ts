import { Injectable, Inject, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import Redis from 'ioredis';
import type { ReadinessResponse } from '@cpi/contracts';
import { CONFIG, type AppConfig } from './config';

@Injectable()
export class Infrastructure implements OnApplicationShutdown {
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
    this.pool.on('error', () => {
      /* Readiness reports outages without logging credentials. */
    });
    this.database = drizzle(this.pool);
    this.redis = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1500,
      commandTimeout: 1500,
      retryStrategy: () => 1000,
    });
    this.redis.on('error', () => {
      /* Readiness reports outages. */
    });
    void this.redis.connect().catch(() => undefined);
  }

  async readiness(): Promise<ReadinessResponse> {
    const results = await Promise.allSettled([
      this.database.execute(sql`select 1`),
      this.redis.ping(),
    ]);
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

  async onApplicationShutdown() {
    this.redis.disconnect();
    await this.pool.end();
  }
}
