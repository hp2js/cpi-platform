import { test, expect, type Page } from '@playwright/test';
import { midYear, publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);
test.use({ viewport: { width: 390, height: 844 } });

/** At phone width the page itself must not scroll sideways; wide tables scroll in their own container. */
async function expectNoPageOverflow(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.right <= width + 1) return false;
        // Content inside a horizontally scrollable container is fine.
        for (
          let parent = element.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          if (
            (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
            parent.getBoundingClientRect().right <= width + 1
          )
            return false;
        }
        return true;
      })
      .slice(0, 3)
      .map(
        (element) =>
          `${element.tagName}.${String(element.className).slice(0, 50)}`,
      );
    return { page: document.documentElement.scrollWidth > width, offenders };
  });
  expect(overflow, name).toEqual({ page: false, offenders: [] });
}

test('mid-year screens fit a phone', async ({ page }) => {
  test.setTimeout(180_000);
  const { review } = await midYear(page);
  for (const [account, path] of [
    ['focal-demo-001', '/institution'],
    ['focal-demo-003', '/institution/reports/FY2026-27-Q1'],
    ['focal-demo-002', '/institution/clarifications'],
    ['focal-demo-001', '/institution/plan'],
    ['focal-demo-001', '/institution/foundations'],
    ['focal-demo-001', '/institution/receipts'],
    ['officer-a', '/officer'],
    ['officer-a', `/officer/reviews/${review}`],
    ['officer-a', '/officer/institutions/DEMO-004'],
    ['administrator', '/admin'],
    ['administrator', '/admin/forms/form-v2'],
    ['administrator', '/admin/notifications'],
    ['administrator', '/admin/audit'],
    ['administrator', '/admin/simulation'],
    ['administrator', '/admin/assignments'],
  ] as const) {
    await visit(page, account, path);
    await expectNoPageOverflow(page, path);
  }
});

test('year-end screens fit a phone', async ({ page }) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  for (const [account, path] of [
    ['focal-demo-005', '/institution/results'],
    ['supervisor', '/supervisor'],
    ['supervisor', '/supervisor/workload'],
    ['supervisor', '/supervisor/annual'],
    ['supervisor', '/supervisor/reports'],
    ['administrator', '/admin/annual'],
  ] as const) {
    await visit(page, account, path);
    await expectNoPageOverflow(page, path);
  }
});
