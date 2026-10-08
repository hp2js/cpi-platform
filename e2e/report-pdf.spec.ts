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
  // Read the download as a stream: no file path is built from variables.
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream())
    chunks.push(Buffer.from(chunk as Buffer));
  return {
    name: file.suggestedFilename(),
    text: Buffer.concat(chunks).toString('latin1'),
  };
}

test('institutions and oversight download the annual report as a document (HP2-64)', { tag: '@core' }, async ({
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
