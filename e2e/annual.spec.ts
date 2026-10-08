import { test, expect, type Page } from './test';
import { readFile } from 'node:fs/promises';
import { publishedYear, reset, visit as as } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

async function runYear(page: Page) {
  await reset(page);
  await as(page, 'administrator', '/admin/simulation');
  await page.getByRole('button', { name: 'Run the scripted year' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Run' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Scripted year: \d+ steps/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText('Closed DEMO-005 Q3 without submission'),
  ).toBeVisible();
}

async function publishAll(page: Page) {
  await as(page, 'administrator', '/admin/annual');
  await page.getByRole('button', { name: /Select all ready \(8\)/ }).click();
  await page.getByRole('button', { name: 'Publish 8 selected' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Publish' })
    .click();
  await expect(page.getByText(/Published v1/).first()).toBeVisible();
}

test('scripted year, withheld results, batch publication and oversight (AT13–AT19)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await runYear(page);

  // Before publication the institution sees no number (AT18).
  await as(page, 'focal-demo-005', '/institution/results');
  await expect(
    page.getByRole('heading', { name: 'Not yet published' }),
  ).toBeVisible();

  await as(page, 'administrator', '/admin/annual');
  const row = (id: string) =>
    page.getByRole('listitem').filter({ hasText: id });
  await expect(row('DEMO-001').getByText('88.75')).toBeVisible();
  await expect(row('DEMO-004').getByText('96.25')).toBeVisible();
  await expect(row('DEMO-005').getByText('70.00')).toBeVisible();
  await expect(row('DEMO-003').getByText(/Q2 4\/4 \(late\)/)).toBeVisible();
  await publishAll(page);

  // The institution sees only its own released result and explanation (AT19).
  await as(page, 'focal-demo-005', '/institution/results');
  await expect(
    page.getByRole('heading', { name: 'Version 1 (current)' }),
  ).toBeVisible();
  await expect(page.getByText('70.00')).toBeVisible();
  await expect(page.getByText('Closed without submission (0)')).toBeVisible();
  await expect(
    page.getByText(/Probability and impact on the declared scale/),
  ).toBeVisible();
  await expect(page.getByText('DEMO-001')).toHaveCount(0);

  // Supervisor metrics carry numerators and denominators; filters live in the URL.
  await as(page, 'supervisor', '/supervisor');
  const coverage = page.getByRole('row', { name: /Submission coverage/ });
  await expect(coverage.getByRole('cell').nth(0)).toHaveText('31');
  await expect(coverage.getByRole('cell').nth(1)).toHaveText('32');
  await expect(
    page
      .getByRole('row', { name: /Annual release coverage/ })
      .getByRole('cell')
      .nth(2),
  ).toHaveText('100%');
  await page.getByRole('combobox', { name: 'Quarter', exact: true }).click();
  await page.getByRole('option', { name: 'Q3' }).click();
  await expect(page).toHaveURL(/periodId=FY2026-27-Q3/);
  await expect(
    page
      .getByRole('row', { name: /Submission coverage/ })
      .getByRole('cell')
      .nth(0),
  ).toHaveText('7');
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Quarter', exact: true }),
  ).toHaveText('Q3');
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByText(/8 of 8 institutions released/)).toBeVisible();
});

test('a published result is corrected only through a case and keeps its history (AT20)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await runYear(page);
  await publishAll(page);

  // Officer cannot reopen a published quarter without a correction case.
  await as(page, 'officer-a', '/officer?tab=finalized');
  await page
    .getByRole('table', { name: /Finalized submissions/ })
    .getByRole('row')
    .filter({ hasText: 'DEMO-008' })
    .filter({ hasText: 'Q4' })
    .getByRole('link')
    .click();
  const reviewUrl = page.url();
  await page
    .getByLabel('Reason for reopening')
    .fill('Later evidence shows the Q4 exception review was not done.');
  await page.getByRole('button', { name: 'Reopen with this reason' }).click();
  await expect(
    page.getByText(/An administrator must open a correction case/),
  ).toBeVisible();

  await as(page, 'administrator', '/admin/annual');
  const demo8 = page.getByRole('listitem').filter({ hasText: 'DEMO-008' });
  await demo8.getByRole('button', { name: 'Open correction case' }).click();
  await demo8.getByRole('combobox', { name: 'Quarter to correct' }).click();
  await page.getByRole('option', { name: 'Q4' }).click();
  await demo8
    .getByLabel('Reason')
    .fill('Later evidence shows the Q4 exception review was not done.');
  await demo8.getByRole('button', { name: 'Open case' }).click();
  await expect(demo8.getByText(/Correction open/)).toBeVisible();

  await as(page, 'officer-a', reviewUrl.replace(/^https?:\/\/[^/]+/, ''));
  await page
    .getByLabel('Reason for reopening')
    .fill('Correction case: the Q4 exception review was not done.');
  await page.getByRole('button', { name: 'Reopen with this reason' }).click();
  const m13 = page.getByRole('article', { name: /^M-13 / });
  await m13.getByLabel(/^Reject:/).check();
  await m13
    .getByRole('textbox')
    .fill('The exception review was not completed in Q4.');
  // The earlier decision already reads "Saved by Prevention Officer A", so wait for this save itself.
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes('/decisions/M-13') &&
      response.request().method() === 'PUT',
  );
  await m13.getByRole('button', { name: 'Update decision' }).click();
  expect((await saved).ok()).toBe(true);
  await page.getByRole('button', { name: 'Finalize review' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Finalize' })
    .click();
  await expect(page.getByText(/Decisions are read-only/)).toBeVisible();

  await as(page, 'administrator', '/admin/annual');
  await page
    .getByRole('checkbox', { name: 'Select DEMO-008 for publication' })
    .check();
  await page.getByRole('button', { name: 'Publish 1 selected' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Publish' })
    .click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'DEMO-008' })
      .getByText(/Published v2/),
  ).toBeVisible();

  await as(page, 'focal-demo-008', '/institution/results');
  await expect(
    page.getByRole('heading', { name: 'Version 2 (current)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Version 1 (superseded)' }),
  ).toBeVisible();
  await expect(page.getByText('96.25').first()).toBeVisible();
  await expect(
    page.getByText(/correction: Later evidence shows/),
  ).toBeVisible();
});

test('supervisors and institutions download the server export as CSV and JSON (FR13, FR16)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await publishedYear(page);
  await as(page, 'supervisor', '/supervisor/reports');
  const read = async (name: string) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    const path = await download.path();
    return {
      file: download.suggestedFilename(),
      text: await readFile(path, 'utf8'),
    };
  };
  const json = await read('JSON');
  expect(json.file).toBe('cpi-consolidated-results.json');
  const payload = JSON.parse(json.text) as {
    schemaVersion: string;
    rows: {
      institution_id: string;
      indicator_id: string;
      earned_points: string;
    }[];
  };
  expect(payload.schemaVersion).toBe('cpi-export-2');
  expect(
    payload.rows.find(
      (row) =>
        row.institution_id === 'DEMO-001' &&
        row.indicator_id === 'annual_total',
    )?.earned_points,
  ).toBe('88.75');
  const csv = await read('CSV');
  expect(csv.text.split('\r\n')[0]).toMatch(/^schema_version,simulation,/);
  expect(csv.text.trim().split('\r\n')).toHaveLength(payload.rows.length + 1);

  await as(page, 'focal-demo-005', '/institution/results');
  const own = await read('Export JSON');
  const rows = (JSON.parse(own.text) as typeof payload).rows;
  expect(rows.every((row) => row.institution_id === 'DEMO-005')).toBe(true);
  expect(rows[0]?.earned_points).toBe('70.00');
});
