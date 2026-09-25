import { test, expect } from '@playwright/test';

test('foundation loads, filters persist, and dialog validates', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Build clarity',
  );
  await expect(page.getByText('✓ Connected', { exact: true })).toHaveCount(2);
  await page.getByLabel('Filter institutions').fill('no match');
  await expect(
    page.getByText('No matching institutions. Try another search.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Filter institutions')).toHaveValue('no match');
  await page.getByLabel('Filter institutions').fill('');
  await page.getByRole('button', { name: 'Try a form' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByLabel('Institution name', { exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Preview entry' }).click();
  await expect(page.getByText('Enter at least 3 characters.')).toBeVisible();
  await page
    .getByLabel('Institution name', { exact: true })
    .fill('Fictional Council');
  await page.getByRole('button', { name: 'Preview entry' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Nothing has been saved.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Try a form' })).toBeFocused();
  expect(errors).toEqual([]);
});

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
  const deep = await request.get('/reports/example?quarter=1');
  expect(deep.status()).toBe(200);
  expect(await deep.text()).toBe(html);
  for (const path of ['/api/missing', '/api', '/assets/missing.js']) {
    const result = await request.get(path);
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
