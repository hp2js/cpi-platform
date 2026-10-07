import { test, expect, type Page } from './test';
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

test('sign-in pages fit a phone', async ({ page }) => {
  for (const [path, heading] of [
    ['/sign-in', 'Sign in'],
    ['/sign-in?demo=open', 'Explore with a demonstration account'],
    ['/forgot-password', 'Reset your password'],
    ['/set-password?token=not-a-real-token', 'This link cannot be used'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expectNoPageOverflow(page, path);
  }
});

test('mid-year screens fit a phone', async ({ page }) => {
  test.setTimeout(180_000);
  const { review } = await midYear(page);
  for (const [account, path] of [
    ['focal-demo-001', '/institution'],
    ['focal-demo-003', '/institution/reports/FY2026-27-Q1'],
    ['focal-demo-002', '/institution/reports'],
    ['focal-demo-001', '/institution/plan'],
    ['focal-demo-001', '/institution/plan?tab=documents'],
    ['focal-demo-001', '/institution/reports'],
    ['officer-a', '/officer'],
    ['officer-a', `/officer/reviews/${review}`],
    ['officer-a', '/officer/evidence'],
    ['supervisor', `/supervisor/reviews/${review}`],
    ['officer-a', '/officer/institutions/DEMO-004'],
    ['administrator', '/admin'],
    ['administrator', '/admin/forms/form-v2'],
    ['administrator', '/admin/notifications'],
    ['administrator', '/admin/audit'],
    ['administrator', '/admin/report-identity'],
    ['administrator', '/admin/simulation'],
    ['administrator', '/admin/assignments'],
    ['supervisor', '/supervisor/institutions'],
    ['supervisor', '/supervisor/institutions/DEMO-003'],
    ['supervisor', '/supervisor/assignments'],
    ['supervisor', '/supervisor/rules'],
    ['officer-a', '/officer/portfolio'],
    ['officer-a', '/officer/rules'],
    ['focal-demo-002', '/institution/profile'],
    ['administrator', '/admin/profiles/hackathon-mock-v1'],
    ['administrator', '/admin/calendar'],
    ['administrator', '/admin/risk-scale'],
    ['administrator', '/admin/institutions'],
    ['administrator', '/admin/institutions/DEMO-001'],
    ['administrator', '/admin/users'],
    ['focal-demo-001', '/institution/account'],
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
