import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, fetchReadiness, NetworkError } from './api';

afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );

it('reads a degraded report from a 503, so the console shows which service is down', async () => {
  const report = {
    status: 'degraded',
    services: { database: 'down', redis: 'up', storage: 'up' },
  };
  answer(503, report);
  await expect(fetchReadiness()).resolves.toEqual(report);
});

it('reports an unreachable API only when there is no answer', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(fetchReadiness()).rejects.toBeInstanceOf(NetworkError);
  answer(502, { message: 'Bad gateway' });
  await expect(fetchReadiness()).rejects.toBeInstanceOf(ApiError);
});
