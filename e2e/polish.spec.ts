import { test, expect } from '@playwright/test';
import { reset, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('role screens read cleanly after the walkthrough fixes (HP2-56)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reset(page);

  // The account name is shown in full when there is room.
  await visit(page, 'focal-demo-001', '/institution');
  const name = page
    .getByRole('button', { name: /Account menu/ })
    .getByText('Focal person, DEMO-001', { exact: true });
  await expect(name).toBeVisible();
  expect(
    await name.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  // Evidence is its own section, and says where foundation documents are.
  await visit(page, 'officer-a', '/officer/evidence');
  await expect(
    page.getByRole('main').getByText('Prevention officer', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/each institution's Foundations tab/),
  ).toBeVisible();

  // Baselines show each proposal's facts; one decision form opens on request.
  await visit(page, 'officer-a', '/officer/institutions/DEMO-001');
  const q2 = page.getByRole('article').filter({ hasText: 'Q2' }).first();
  await expect(q2.getByLabel('Rationale (kept for audit)')).toHaveCount(0);
  await expect(q2.getByLabel('Feedback for the institution')).toHaveCount(0);
  await q2.getByRole('button', { name: 'Approve this proposal…' }).click();
  await expect(q2.getByLabel('Rationale (kept for audit)')).toBeVisible();
  await expect(q2.getByLabel('Feedback for the institution')).toHaveCount(0);

  // The clock explains what its count covers.
  await visit(page, 'administrator', '/admin/simulation');
  await expect(page.getByText(/since the seed/)).toBeVisible();
  await expect(
    page.getByText(/part of the seeded state and not counted/),
  ).toBeVisible();
});

test('on a phone, dev controls open from the account menu instead of covering content (HP2-56)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reset(page);
  await visit(page, 'focal-demo-001', '/institution');
  await expect(
    page.getByRole('button', { name: /^(Mock API|Dev controls)$/ }),
  ).toBeHidden();
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Dev controls' }).click();
  await expect(page.getByRole('region', { name: /controls$/ })).toBeVisible();
});
