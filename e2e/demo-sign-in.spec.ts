import { test, expect } from '@playwright/test';
import { reset } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Demonstration accounts depend on local fixtures',
);

test(
  'a visitor signs in with a demonstration account and lands on their home (HP2-95)',
  { tag: '@core' },
  async ({ page }) => {
    await reset(page);
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: /Explore with a demonstration account/ })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Focal person, DEMO-001/ })
      .click();
    await expect(page).toHaveURL(/\/institution/);
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible();
  },
);
