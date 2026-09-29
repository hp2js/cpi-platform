import { test, expect } from './test';
import { midYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('support view is justified, read only, told to the institution and found in the audit log', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin');
  await expect(
    page.getByRole('region', { name: 'What needs you' }),
  ).toBeVisible();

  await visit(page, 'administrator', '/admin/institutions/DEMO-002');
  await page.getByRole('button', { name: /Support view/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Open read-only view' }),
  ).toBeDisabled();
  await dialog
    .getByLabel('Why do you need to see it?')
    .fill('Focal person reports the milestones section will not save.');
  await dialog.getByRole('button', { name: 'Open read-only view' }).click();
  await expect(dialog).toContainText('Draft version');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  await visit(page, 'administrator', '/admin/audit');
  await page.getByLabel(/Elevated actions only/).check();
  const table = page.getByRole('table');
  await expect(table).toContainText('support.draft_view');
  await expect(table.getByText('Elevated').first()).toBeVisible();

  await visit(page, 'focal-demo-002', '/institution/inbox');
  await expect(
    page.getByText('An administrator viewed your Q1 report for support'),
  ).toBeVisible();
});

test('an administrator moves several institutions at once', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin/assignments');
  const bulk = page.getByRole('region', { name: 'Move several institutions' });
  await bulk.getByRole('combobox', { name: 'Currently with' }).click();
  await page.getByRole('option', { name: /Prevention Officer A/ }).click();
  await bulk.getByLabel(/Select all 4 shown/).check();
  await expect(bulk.getByText('4 selected')).toBeVisible();
  await bulk.getByRole('combobox', { name: 'New reviewing officer' }).click();
  await page
    .getByRole('option', { name: /Prevention Officer B/ })
    .last()
    .click();
  await bulk.getByLabel('Reason').fill('Officer A is on extended leave.');
  await bulk.getByRole('button', { name: 'Move 4 institutions' }).click();
  await expect(bulk.getByText('Moved 4 institutions.')).toBeVisible();

  await visit(page, 'administrator', '/admin');
  await expect(
    page.getByRole('link', { name: /Officers with no institutions/ }),
  ).toBeVisible();
});

test('demo data saved by an older version is replaced, not served to new screens', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin');
  // Simulate a browser holding data from before assignments gained cover and handover notes.
  const mockData = await page.evaluate(() =>
    localStorage.getItem('cpi-mock-db'),
  );
  test.skip(!mockData, 'Only the mock API keeps data in the browser');
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('cpi-mock-db')!);
    stored.schemaVersion = 13;
    for (const assignment of stored.assignments) {
      delete assignment.cover;
      delete assignment.handoverNote;
    }
    localStorage.setItem('cpi-mock-db', JSON.stringify(stored));
  });
  await page.goto('/sign-in?demo=open');
  await page
    .getByRole('region', { name: 'Administrator' })
    .getByRole('button', { name: /Administrator/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Console' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Officer portfolios' }),
  ).toBeVisible();
  await expect(page.getByText('Prevention Officer A')).toBeVisible();
  await expect(page.getByText(/could not load/i)).toHaveCount(0);
});
