import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { api, midYear, signInAs, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

async function scan(page: Page) {
  // Scan from the top: a field the last step left under the pinned save bar would otherwise
  // count as an obscured target, whatever the page's design.
  await page.evaluate(() => window.scrollTo(0, 0));
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

async function addQuestion(page: Page, section: Locator, type: string) {
  await section.getByRole('combobox', { name: 'New question type' }).click();
  await page.getByRole('option', { name: type, exact: true }).click();
  await section.getByRole('button', { name: 'Add question' }).click();
  return section.locator(':scope > ol > li').last();
}

test('an administrator adds repeated rows and limits, sees the changes, publishes, and institutions answer within the limits (FR03)', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await midYear(page);
  await visit(page, 'administrator', '/admin/forms/form-v2');
  const section = page.getByRole('region', { name: 'Section 3' });

  const rows = await addQuestion(page, section, 'Repeated rows');
  await rows.getByLabel('Question label').fill('Trainings held this quarter');
  await rows.getByLabel('Column 1').fill('Topic');
  await rows.getByRole('button', { name: 'Add column' }).click();
  await rows.getByLabel('Column 2').fill('Staff attending');
  await rows.getByRole('combobox', { name: 'Type' }).last().click();
  await page.getByRole('option', { name: 'Number', exact: true }).click();
  await rows.getByLabel('Lowest').fill('1');

  const staff = await addQuestion(page, section, 'Number');
  await staff.getByLabel('Question label').fill('Staff trained');
  await staff.locator('summary', { hasText: 'Answer limits' }).click();
  await staff.getByLabel('Lowest').fill('0');
  await staff.getByLabel('Highest').fill('500');
  await staff.getByLabel('Unit').fill('staff');
  await staff.getByLabel('Whole numbers only').check();
  const checklist = await addQuestion(page, section, 'Checklist');
  await checklist.getByLabel('Question label').fill('Controls in place');
  await checklist.getByLabel('Item 1').fill('Gift register kept');
  await checklist.getByRole('button', { name: 'Add item' }).click();
  await checklist.getByLabel('Item 2').fill('Declarations filed');
  await scan(page);
  await page.getByRole('button', { name: 'Save draft' }).click();
  const changes = page.getByRole('region', {
    name: 'Changes from version 1',
  });
  await expect(changes).toContainText(
    'Added question: Trainings held this quarter',
  );
  await expect(changes).toContainText('Added question: Staff trained');
  await expect(changes).toContainText('Added question: Controls in place');

  // Another administrator saves first: this page is told, and reloads their work.
  const other = await context.newPage();
  await other.goto('/admin/forms/form-v2');
  await other.getByLabel('Form title').fill('Quarterly progress report (v2)');
  await other.getByRole('button', { name: 'Save draft' }).click();
  await expect(other.getByText(/^Saved /)).toBeVisible();
  await other.close();
  await page.getByLabel('Form title').fill('Something else');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(
    page.getByText(/Someone saved this draft after you opened it/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reload the saved draft' }).click();
  await expect(page.getByLabel('Form title')).toHaveValue(
    'Quarterly progress report (v2)',
  );

  await page.getByRole('button', { name: 'Publish version 2' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(
    'Added question: Trainings held this quarter',
  );
  await confirm.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/this version is locked/)).toBeVisible();

  await visit(page, 'supervisor', '/supervisor/inbox');
  await expect(
    page.getByText(/Changes from version 1: 3 questions added/).first(),
  ).toBeVisible();

  // Q2 reporting opens on version 2.
  await signInAs(page, 'administrator');
  await api(page, '/api/simulation/advance', {
    method: 'POST',
    json: { boundaryId: 'Q2-open' },
  });
  await visit(page, 'focal-demo-003', '/institution/reports/FY2026-27-Q2');
  await expect(
    page.getByText('Accepted: 0 to 500 staff, whole numbers.'),
  ).toBeVisible();
  const trained = page.getByLabel('Staff trained');
  await trained.fill('900');
  await trained.blur();
  await expect(
    page.getByText('Enter a number from 0 to 500 staff.'),
  ).toBeVisible();
  await trained.fill('40');
  await trained.blur();
  await expect(
    page.getByText('Enter a number from 0 to 500 staff.'),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Add a row' }).click();
  const row = page.getByRole('listitem', { name: 'Row 1' });
  await row.getByLabel('Topic').fill('Gift policy refresher');
  await row.getByLabel('Staff attending').fill('0');
  await expect(row.getByText('Enter at least 1.')).toBeVisible();
  await row.getByLabel('Staff attending').fill('35');
  await expect(row.getByText('Enter at least 1.')).toBeHidden();
  const controls = page
    .locator('[id^="field-questions-question"]')
    .filter({ hasText: 'Controls in place' });
  await controls.getByRole('radio', { name: 'Done' }).first().check();
  await controls.getByRole('radio', { name: 'Not done' }).last().check();
  await scan(page);
});

test('an unwanted draft version is discarded with a reason', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin/forms/form-v2');
  await page.getByRole('button', { name: 'Discard draft' }).click();
  const dialog = page.getByRole('alertdialog');
  const confirm = dialog.getByRole('button', { name: 'Discard draft' });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByLabel('Reason')
    .fill('Started by mistake; nothing to change.');
  await confirm.click();
  await expect(
    page.getByRole('heading', { name: 'Reporting forms', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Version 2' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'New version' })).toBeEnabled();
});
