import { test, expect } from '@playwright/test';
import { publishedYear, reset, signInAs, visit, api } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('a quarter closed without submission says what was recorded, on the report and on review and submit (HP2-47)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  for (const path of [
    '/institution/reports/FY2026-27-Q3',
    '/institution/reports/FY2026-27-Q3/review',
  ]) {
    await visit(page, 'focal-demo-005', path);
    await expect(
      page.getByText('Q3 was closed without submission'),
    ).toBeVisible();
    await expect(page.getByText(/Prevention Officer B, /)).toBeVisible();
    await expect(
      page.getByText(/it will not\s+reopen by itself/),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'See your published result' }),
    ).toBeVisible();
    await expect(page.getByText(/not open yet/)).toHaveCount(0);
  }
});

test('before the form is published, review and submit explains why and makes no failing request (HP2-47)', async ({
  page,
}) => {
  await reset(page);
  await signInAs(page, 'focal-demo-001');
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/institution/reports/FY2026-27-Q2/review');
  await expect(
    page.getByText('The report form has not been published yet'),
  ).toBeVisible();
  expect(failures).toEqual([]);

  // A quarter still in the future, once the form is published.
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await visit(page, 'focal-demo-001', '/institution/reports/FY2026-27-Q4');
  await expect(page.getByText('This report is not open yet')).toBeVisible();
});
