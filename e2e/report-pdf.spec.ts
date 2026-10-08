import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

async function download(page: Page, button: string | RegExp) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).first().click(),
  ]);
  const path = await file.path();
  const text = readFileSync(path).toString('latin1');
  if (process.env.SHOTS_DIR)
    await file.saveAs(`${process.env.SHOTS_DIR}/${file.suggestedFilename()}`);
  return { name: file.suggestedFilename(), text };
}

test('institutions and oversight download the annual report as a document (HP2-64)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);

  await visit(page, 'focal-demo-001', '/institution/results');
  const own = await download(page, /Download PDF/);
  expect(own.name).toBe('CPI-FY2026-27-DEMO-001-v1.pdf');
  expect(own.text.startsWith('%PDF-1.7')).toBe(true);
  expect(own.text).toContain('/StructTreeRoot');
  expect(own.text).toContain('(Simulation: not official EACC scoring');

  await visit(page, 'supervisor', '/supervisor/reports');
  const all = await download(page, 'Download PDF');
  expect(all.name).toMatch(/^CPI-FY2026-27-consolidated-batch-\d+\.pdf$/);
  expect(all.text).toContain('(Summary of all institutions)');
});
