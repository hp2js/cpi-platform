import { test, expect } from '@playwright/test';
import { reset, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('an administrator imports institutions from a CSV after a row-by-row preview', async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'administrator', '/admin/people');
  await page.getByRole('button', { name: 'Import from CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import institutions' });
  const header =
    'institution_id,name,type,officer_email,focal_name,focal_email,focal_contact,accounting_officer_contact';
  const upload = (rows: string[]) =>
    dialog.getByLabel('CSV file').setInputFiles({
      name: 'institutions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([header, ...rows].join('\n')),
    });

  await upload([
    'MDA-301,Demo Tea Board,State corporation,officer.a@example.invalid,Focal person MDA-301,focal.mda-301@example.invalid,,',
    'DEMO-001,Duplicate agency,State agency,officer.a@example.invalid,,,,',
  ]);
  await expect(
    dialog.getByText(/1 ready, 1 row needs attention/),
  ).toBeVisible();
  await expect(dialog.getByText('DEMO-001 is already in use.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Import/ })).toBeDisabled();

  await upload([
    'MDA-301,Demo Tea Board,State corporation,officer.a@example.invalid,Focal person MDA-301,focal.mda-301@example.invalid,,',
    'MDA-302,Demo Fisheries Service,State agency,officer.b@example.invalid,,,,',
  ]);
  await dialog.getByRole('button', { name: 'Import 2 institutions' }).click();
  await expect(
    dialog.getByText('2 institutions imported, with 1 focal person accounts.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByLabel('Find an institution').fill('fisheries');
  await expect(page.getByRole('rowheader', { name: /MDA-302/ })).toBeVisible();
  await expect(page.getByText('1 of 10 shown')).toBeVisible();
});

test('searchable selects filter long lists from the keyboard', async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'supervisor', '/supervisor');
  const trigger = page.getByRole('combobox', {
    name: 'Institution',
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('combobox', { name: 'Search institutions' }),
  ).toBeFocused();
  await page.keyboard.type('land records');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/institutionId=DEMO-008/);
  await expect(trigger).toHaveText(/DEMO-008/);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(
    page.getByRole('combobox', { name: 'Search institutions' }),
  ).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/institutionId=/);
});

test('the administrator can enforce working days', async ({ page }) => {
  await reset(page);
  await visit(page, 'administrator', '/admin/calendar');
  await page.getByRole('radio', { name: 'Working days' }).click();
  await page
    .getByLabel(
      /When saving, set the deadlines of quarters that have not opened/,
    )
    .check();
  await page
    .getByLabel('Reason for the change')
    .fill('The organizer confirmed working days for this cycle.');
  await page.getByRole('button', { name: 'Save calendar' }).click();
  await expect(page.getByText('Calendar saved')).toBeVisible();
  await expect(page.getByLabel('Q1 deadline')).toHaveValue('2026-10-15');
  await expect(page.getByLabel('Q2 deadline')).toHaveValue('2027-01-22');
  await expect(
    page.getByText(/Day counting calendar → working days/),
  ).toBeVisible();
  await expect(page.getByText('7 working days before')).toBeVisible();
});

test('the header and sidebar stay in place while the page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await reset(page);
  await visit(page, 'administrator', '/admin/audit');
  await visit(page, 'administrator', '/admin/profiles/hackathon-mock-v1');
  const nav = page.getByRole('navigation', { name: 'Administration' });
  const account = page.getByRole('button', { name: /Account menu/ });
  const before = await account.boundingBox();
  await page.mouse.move(900, 400);
  await page.mouse.wheel(0, 1500);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(150);
  expect((await account.boundingBox())?.y).toBe(before?.y);
  // The sidebar does not move with the page; on a short screen it scrolls on its own.
  await expect(nav.getByRole('link', { name: 'Console' })).toBeInViewport();
});
