import { test, expect } from '@playwright/test';
import { midYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('an open quarter reads as open in oversight, and each metric shows once (HP2-55)', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'officer-a', '/officer/portfolio');
  const q1 = page.getByRole('row', { name: /^Q1 / });
  await expect(q1).toContainText(/Open · due .*15 Oct 2026/);
  await expect(q1).toContainText(/\d of 4 received/);
  await expect(q1).toContainText('Measured once the deadline passes');
  await expect(page.getByText('Not yet due')).toHaveCount(0);

  await visit(page, 'supervisor', '/supervisor');
  const coverage = page.getByRole('region', { name: 'Coverage and review' });
  await expect(coverage.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /^Q1 / }).first()).toContainText(
    'Open · due',
  );
});

test('the audit log names actions in plain words with local actual time (HP2-54)', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin/audit');
  const table = page.getByRole('table', { name: 'Audit events, newest first' });
  await expect(table.getByText('Form version published').first()).toBeVisible();
  await expect(table.getByText('form.publish').first()).toBeVisible();
  await expect(
    table.getByRole('columnheader', { name: 'Actual time', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('(UTC)')).toHaveCount(0);
  await expect(table.getByRole('row').nth(1)).toContainText(/EAT.*EAT/s);

  // The action filter uses the same names.
  await page.getByRole('combobox', { name: 'Action' }).click();
  await expect(
    page.getByRole('option', { name: /^Form version published/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // Phones get one card per event, with no sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeHidden();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Form version published' })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
