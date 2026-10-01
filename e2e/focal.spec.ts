import { test, expect } from './test';
import { midYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('a focal person keeps the Accounting Officer contact current from Our institution', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'focal-demo-002', '/institution');
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Our institution' }).click();
  await expect(
    page.getByRole('heading', { name: 'Demo Water Services Board', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Focal persons' }),
  ).toContainText('(you)');
  await page.getByLabel('Designation').fill('Acting Managing Director');
  await page.getByRole('button', { name: 'Save Accounting Officer' }).click();
  await expect(
    page.getByText('The Accounting Officer’s details are saved.'),
  ).toBeVisible();

  await visit(page, 'officer-a', '/officer/inbox');
  await expect(
    page.getByText('DEMO-002 updated its Accounting Officer contact'),
  ).toBeVisible();
});

test('deactivating an institution’s last focal person is confirmed and then flagged', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin/users');
  await page.getByLabel('Find a user').fill('DEMO-003');
  await page
    .getByRole('button', { name: /Deactivate Focal person, DEMO-003/ })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reason').fill('Left the institution this week.');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'the only active focal person for DEMO-003',
  );
  await expect(
    dialog.getByRole('button', { name: 'Deactivate' }),
  ).toBeDisabled();
  await dialog.getByLabel(/Deactivate anyway/).check();
  await dialog.getByRole('button', { name: 'Deactivate' }).click();
  await expect(dialog).toBeHidden();

  await visit(page, 'officer-a', '/officer/institutions/DEMO-003');
  await expect(
    page
      .getByRole('region', { name: 'Your assignment' })
      .getByText('No active focal person'),
  ).toBeVisible();
});

test('the home to-do list leads to a clarification shown where it applies', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'focal-demo-002', '/institution');
  const todo = page.getByRole('region', { name: 'What needs you' });
  const clarification = todo
    .getByRole('listitem')
    .filter({ hasText: 'Answer the clarification on your Q1 report' });
  await expect(clarification).toContainText(
    '1 question from your reviewing officer',
  );
  await expect(clarification).toContainText(/days left|Due today|Due tomorrow/);
  await clarification.getByRole('link', { name: /Respond/ }).click();

  await expect(
    page.getByRole('navigation', { name: 'Report sections' }),
  ).toContainText(/of \d+/);
  await page
    .getByRole('navigation', { name: 'Questioned milestones' })
    .getByRole('link', { name: /M-01/ })
    .click();
  await expect(
    page.getByText('Your officer asked about this milestone'),
  ).toBeInViewport();
});

test('the rail lists sections with attention badges and the year’s quarters, and old addresses redirect', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'focal-demo-002', '/institution');
  const nav = page.getByRole('navigation', { name: 'Institution' }).first();
  // The desktop rail: the four sections, then the institution page and the inbox.
  await expect(nav.getByRole('link')).toHaveText([
    'Home',
    /^Reports1 needing attention$/,
    'Plan & documents',
    'Results',
    'Our institution',
    'Inbox',
  ]);
  // The year's quarters sit below, each with its state in words and a link to its report.
  const quarters = page.getByRole('region', { name: 'FY 2026/27 quarters' });
  await expect(quarters.getByRole('link', { name: /^Q1/ })).toContainText(
    'Clarification requested',
  );
  await quarters.getByRole('link', { name: /^Q1/ }).click();
  await expect(page).toHaveURL(/\/institution\/reports\/FY2026-27-Q1$/);
  // Bookmarks and older notifications still work.
  await page.goto('/institution/clarifications');
  await expect(page).toHaveURL(/\/institution\/reports$/);
  await page.goto('/institution/foundations');
  await expect(page).toHaveURL(/\/institution\/plan\?tab=documents$/);
  await expect(
    page.getByRole('tab', { name: 'Foundation documents', selected: true }),
  ).toBeVisible();
});
