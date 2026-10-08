import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { api, reset, signInAs, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

async function openFile(page: Page, name: string) {
  await page
    .getByRole('button', { name: `${name} (view or download)` })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function download(page: Page, dialog: ReturnType<Page['getByRole']>) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /^Download/ }).click(),
  ]);
  return file.suggestedFilename();
}

test('an institution previews and downloads its own Word, Excel and image files, also after a reload', { tag: '@core' }, async ({
  page,
}) => {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await visit(page, 'focal-demo-001', '/institution/reports/FY2026-27-Q1');
  const cpc = page.locator('#field-questions-cpc-minutes');
  const iao = page.locator('#field-questions-iao-minutes');
  await cpc
    .getByLabel('Upload a file', { exact: true })
    .setInputFiles(fixture('cpc-minutes.docx'));
  await expect(
    cpc.getByRole('list').getByText('cpc-minutes.docx'),
  ).toBeVisible();
  await iao
    .getByLabel('Upload a file', { exact: true })
    .setInputFiles(fixture('allocation-register.xlsx'));
  await expect(
    iao.getByRole('list').getByText('allocation-register.xlsx'),
  ).toBeVisible();
  await iao
    .getByLabel('Upload a file', { exact: true })
    .setInputFiles(fixture('notice-board.png'));
  await expect(
    iao.getByRole('list').getByText('notice-board.png'),
  ).toBeVisible();

  let dialog = await openFile(page, 'cpc-minutes.docx');
  await expect(dialog).toContainText('Word document');
  await expect(
    dialog
      .frameLocator('iframe')
      .getByText('The committee met on 12 September 2026'),
  ).toBeVisible();
  expect(await download(page, dialog)).toBe('cpc-minutes.docx');
  await page.keyboard.press('Escape');

  dialog = await openFile(page, 'allocation-register.xlsx');
  await expect(dialog.getByRole('cell', { name: 'AL-002' })).toBeVisible();
  await expect(dialog.getByText(/Register: 3 rows/)).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[role=dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
  await page.keyboard.press('Escape');

  dialog = await openFile(page, 'notice-board.png');
  await expect(
    dialog.getByRole('img', { name: 'notice-board.png' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Actual size' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Fit to window' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // The mock keeps uploaded contents across a reload, as a real file store would.
  await page.reload();
  dialog = await openFile(page, 'cpc-minutes.docx');
  await expect(
    dialog
      .frameLocator('iframe')
      .getByText('The committee met on 12 September 2026'),
  ).toBeVisible();
  await expect(dialog.getByText(/Demonstration copy/)).toBeHidden();
});

test('an officer opens the foundation documents they review', { tag: '@core' }, async ({
  page,
}) => {
  await reset(page);
  await visit(page, 'officer-a', '/officer/institutions/DEMO-001');
  await page.getByRole('tab', { name: 'Foundations' }).click();
  const dialog = await openFile(page, 'prevention-procedures-2026.pdf');
  await expect(dialog).toContainText('PDF document');
  await expect(dialog.getByText(/Demonstration copy/)).toBeVisible();
  // Drawn with pdf.js, so it shows in every browser; the page text is there for screen readers.
  await expect(dialog.getByText('Page 1 of 1')).toBeVisible();
  await expect(dialog.getByTestId('pdf-page-text')).toContainText(
    'DEMONSTRATION COPY',
  );
  await expect
    .poll(() =>
      dialog
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    )
    .toBeGreaterThan(300);
  const results = await new AxeBuilder({ page })
    .include('[role=dialog]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
  await dialog.getByRole('button', { name: 'Zoom in' }).click();
  await expect(
    dialog.getByRole('button', { name: 'Fit width' }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(await download(page, dialog)).toBe(
    'prevention-procedures-2026-demonstration.pdf',
  );
});
