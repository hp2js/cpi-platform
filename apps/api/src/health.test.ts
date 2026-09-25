import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { loadConfig } from './config';
import { HealthController } from './health.controller';
import type { Infrastructure } from './infrastructure';

describe('configuration', () => {
  it('rejects invalid settings without exposing credentials', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'secret-password',
        REDIS_URL: 'http://wrong',
        API_PORT: '0',
      }),
    ).toThrow('Invalid environment: API_PORT, DATABASE_URL, REDIS_URL');
  });
});
describe('health endpoints', () => {
  it('keeps liveness separate from failing dependencies', async () => {
    const controller = new HealthController({
      readiness: vi.fn().mockResolvedValue({
        status: 'degraded',
        services: { database: 'down', redis: 'up' },
      }),
    } as unknown as Infrastructure);
    expect(controller.live()).toEqual({ status: 'ok' });
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('reports readiness only when both dependencies work', async () => {
    const result = { status: 'ok', services: { database: 'up', redis: 'up' } };
    const controller = new HealthController({
      readiness: vi.fn().mockResolvedValue(result),
    } as unknown as Infrastructure);
    await expect(controller.ready()).resolves.toEqual(result);
  });
});
