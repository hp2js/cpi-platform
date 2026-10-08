import { test, expect, type Page } from '@playwright/test';
import { publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/** A4 portrait less the 12 mm side margins set in @page, at 96 dpi. */
const A4_CONTENT_WIDTH = Math.round(((210 - 24) / 25.4) * 96);
/** A4 portrait less the 14 mm top and bottom margins. */
const A4_CONTENT_HEIGHT = Math.round(((297 - 28) / 25.4) * 96);

async function printLayout(page: Page) {
  await page.setViewportSize({ width: A4_CONTENT_WIDTH, height: 1000 });
  await page.emulateMedia({ media: 'print' });
}

/** Everything the screen explains must be in the printout, and nothing of the app around it. */
async function expectPrintableReport(page: Page) {
  const leaks = await page.evaluate(() =>
    [...document.querySelectorAll('[data-print-hide], nav, aside')]
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => element.outerHTML.slice(0, 80)),
  );
  expect(leaks).toEqual([]);
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('[data-slot="table-container"]')]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent?.slice(0, 60)),
  );
  expect(clipped).toEqual([]);
  await expect(
    page.getByText(/simulation profile, not official EACC scoring/).first(),
  ).toBeVisible();
}

async function pdfPages(page: Page) {
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  return pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

test('printed annual results keep every column, reason and the simulation marking (HP2-63)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);

  // The institution's own report: reviewer and every reason for a lost point are printed.
  await visit(page, 'focal-demo-001', '/institution/results');
  await printLayout(page);
  await expectPrintableReport(page);
  await expect(
    page.getByRole('columnheader', { name: 'Reviewer and feedback' }),
  ).toBeVisible();
  await expect(
    page.getByText(/exception review is not recorded in the minutes/i).first(),
  ).toBeVisible();
  // The report cover names the institution and the issuer (HP2-65).
  const cover = page.getByRole('region', { name: 'Report cover' });
  await expect(cover).toContainText('DEMO-001 · ');
  await expect(cover).toContainText(
    'Demonstration Oversight Office (fictional)',
  );
  expect(await pdfPages(page)).toBeLessThanOrEqual(2);

  // The consolidated report: method, coverage and summary first, then one institution per page.
  await page.emulateMedia({ media: 'screen' });
  await visit(page, 'supervisor', '/supervisor/reports');
  await printLayout(page);
  await expectPrintableReport(page);
  const sections = page.locator('main section[aria-labelledby^="rel-"]');
  await expect(sections).toHaveCount(8);
  const methodTop = await page
    .locator('#method-heading')
    .evaluate((element) => element.getBoundingClientRect().top + scrollY);
  expect(methodTop).toBeLessThan(A4_CONTENT_HEIGHT / 2);
  await expect(
    page.getByRole('table', { name: /Annual results of every expected/ }),
  ).toBeVisible();
  const pages = await pdfPages(page);
  expect(pages).toBeGreaterThanOrEqual(9);
  expect(pages).toBeLessThanOrEqual(18);
});
