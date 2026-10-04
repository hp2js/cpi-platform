import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { integration, startApi } from '../test/api';

/** Development controls the dev toolbar and e2e specs rely on. */
describe.skipIf(!integration)('development controls', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    await api.flushRedis();
  });

  it('toggles email failure mode; anything but enabled: true turns it off', async () => {
    const client = api.client();
    expect(await client.json('/__mock/email-failure')).toEqual({
      enabled: false,
    });
    const on = await client.post('/__mock/email-failure', { enabled: true });
    expect(on).toMatchObject({ status: 200, body: { enabled: true } });
    expect(await client.json('/__mock/email-failure')).toEqual({
      enabled: true,
    });
    const off = await client.post('/__mock/email-failure', { enabled: 'yes' });
    expect(off).toMatchObject({ status: 200, body: { enabled: false } });
  });

  it('expires the session, then resets and signs the caller out', async () => {
    const client = await api.client().signIn('officer-a');
    expect((await client.post('/__mock/expire-session')).status).toBe(204);
    expect(await client.request('/session')).toMatchObject({
      status: 401,
      body: { code: 'session_expired' },
    });
    await client.signIn('officer-a');
    const reset = await client.post('/__mock/reset');
    expect(reset).toMatchObject({ status: 200, body: { runId: 'run-001' } });
    expect(reset.headers.getSetCookie().join()).toContain('cpi_session=;');
    expect((await client.post('/__mock/deliveries/run')).status).toBe(204);
  });

  it('is hidden outside development demo deployments', async () => {
    const production = await startApi({ NODE_ENV: 'production' });
    try {
      const client = production.client();
      for (const path of ['/__mock/email-failure', '/__mock/reset'])
        expect(
          (
            await client.request(path, {
              method: path.endsWith('reset') ? 'POST' : 'GET',
            })
          ).status,
        ).toBe(404);
    } finally {
      await production.stop();
    }
  }, 60_000);
});
