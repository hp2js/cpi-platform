import { test, expect } from '@playwright/test';
import { reset, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('plan approvals and document reviews show in the officer and supervisor work views (HP2-52)', async ({
  page,
}) => {
  await reset(page);

  // The officer's assigned work lists plan items, urgent ones first and explained in words.
  await visit(page, 'officer-a', '/officer');
  await expect(
    page.getByText(/plan and document items to review/),
  ).toBeVisible();
  const work = page.getByRole('region', {
    name: 'Plans and documents to review',
  });
  const firstRow = work.getByRole('row').nth(1);
  await expect(firstRow).toContainText(/Urgent:/);
  await expect(
    work
      .getByText('Q2 started on 1 Oct 2026 without an approved baseline')
      .first(),
  ).toBeVisible();
  await expect(
    work
      .getByText(/seeded baseline to confirm against the approved plan/)
      .first(),
  ).toBeVisible();
  await expect(work.getByText(/version 1 to review/).first()).toBeVisible();

  // Each item opens the tab where the work is done.
  await work
    .getByRole('link', { name: /^DEMO-001 Baselines: Q2 baseline proposal/ })
    .click();
  await expect(page).toHaveURL(
    /\/officer\/institutions\/DEMO-001\?tab=baselines/,
  );
  await expect(
    page.getByRole('tab', { name: 'Baselines', selected: true }),
  ).toBeVisible();
  await page.goBack();
  await work
    .getByRole('link', { name: /^DEMO-001 Foundations:/ })
    .first()
    .click();
  await expect(
    page.getByRole('tab', { name: 'Foundations', selected: true }),
  ).toBeVisible();

  // The supervisor sees the plan backlog beside submissions, split per officer.
  await visit(page, 'supervisor', '/supervisor');
  const attention = page.getByRole('region', { name: 'Needs attention' });
  await expect(
    attention.getByText('Plans and documents awaiting officer', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(attention.getByText(/urgent/).first()).toBeVisible();
  await expect(
    attention
      .getByText('Q2 started on 1 Oct 2026 without an approved baseline')
      .first(),
  ).toBeVisible();
  await visit(page, 'supervisor', '/supervisor/workload');
  await expect(
    page.getByRole('columnheader', {
      name: 'Plans and documents awaiting officer',
    }),
  ).toBeVisible();
  const row = page.getByRole('row', { name: /Prevention Officer A/ });
  await expect(row.getByText(/urgent/)).toBeVisible();
});
