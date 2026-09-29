import { test, expect } from './test';

test('Caddy serves deep links and keeps API/assets separate from SPA fallback', async ({
  request,
}) => {
  test.skip(
    process.env.CPI_PRODUCTION !== 'true',
    'Production web-server checks',
  );
  const index = await request.get('/');
  expect(index.headers()['server']).toBe('Caddy');
  expect(index.headers()['cache-control']).toBe('no-cache');
  const html = await index.text();
  const deep = await request.get('/officer/reviews/example?revision=2');
  expect(deep.status()).toBe(200);
  expect(await deep.text()).toBe(html);
  for (const path of [
    '/api/missing',
    '/api',
    '/assets/missing.js',
    '/mockServiceWorker.js',
  ]) {
    const result = await request.get(path);
    if (path === '/mockServiceWorker.js') {
      // Production builds must not ship the mock API worker; the SPA fallback answers instead.
      expect(await result.text()).not.toContain('Mock Service Worker');
      continue;
    }
    expect(result.status()).toBe(404);
    expect(await result.text()).not.toContain('id="root"');
  }
  const health = await request.get('/api/health/ready');
  expect(health.status()).toBe(200);
  expect(health.headers()['x-request-id']).toBeTruthy();
  expect((await request.get('/healthz')).status()).toBe(200);
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(asset).toBeTruthy();
  const response = await request.get(asset!);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('immutable');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
});
