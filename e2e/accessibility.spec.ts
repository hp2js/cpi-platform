import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { midYear, openApp, publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/**
 * Automated WCAG 2.2 A/AA checks with axe on every screen, populated with realistic data.
 * Automated checks find a subset of issues; they do not establish full conformance (PRD §11).
 */
async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.map((violation) => ({
    page: name,
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }));
  expect(violations, `${name}: ${JSON.stringify(violations, null, 2)}`).toEqual(
    [],
  );
}

test('public pages', async ({ page }) => {
  await openApp(page);
  await scan(page, 'sign-in');
  await page.goto('/forbidden');
  await scan(page, 'forbidden');
  await page.goto('/session-expired');
  await scan(page, 'session-expired');
});

test('mid-year screens for every role', async ({ page }) => {
  test.setTimeout(180_000);
  const { review } = await midYear(page);
  const screens: [string, string, string][] = [
    ['focal-demo-001', '/institution', 'institution home'],
    [
      'focal-demo-003',
      '/institution/reports/FY2026-27-Q1',
      'institution report editor',
    ],
    [
      'focal-demo-002',
      '/institution/reports/FY2026-27-Q1',
      'institution editor with clarification',
    ],
    [
      'focal-demo-002',
      '/institution/clarifications',
      'institution clarifications',
    ],
    ['focal-demo-001', '/institution/receipts', 'institution receipts'],
    ['focal-demo-001', '/institution/plan', 'institution plan'],
    ['focal-demo-001', '/institution/foundations', 'institution foundations'],
    ['focal-demo-002', '/institution/inbox', 'institution inbox'],
    [
      'focal-demo-001',
      '/institution/results',
      'institution results (unreleased)',
    ],
    ['officer-a', '/officer', 'officer queue'],
    ['officer-a', `/officer/reviews/${review}`, 'officer review workspace'],
    ['officer-a', '/officer/evidence', 'officer evidence lookup'],
    ['supervisor', '/supervisor/submissions', 'supervisor submissions'],
    [
      'supervisor',
      `/supervisor/reviews/${review}`,
      'supervisor review (read only)',
    ],
    ['supervisor', '/supervisor/evidence', 'supervisor evidence lookup'],
    [
      'officer-a',
      '/officer/institutions/DEMO-004',
      'officer institution baselines',
    ],
    ['admin', '', ''],
  ];
  for (const [account, path, name] of screens.filter(
    ([account]) => account !== 'admin',
  )) {
    await visit(page, account, path);
    await page.waitForLoadState('networkidle');
    await scan(page, name);
  }
  await page.getByRole('tab', { name: 'Foundations' }).click();
  await scan(page, 'officer foundations tab');
  for (const [path, name] of [
    ['/admin', 'admin console'],
    ['/admin/forms', 'admin forms'],
    ['/admin/forms/form-v2', 'admin form editor'],
    ['/admin/assignments', 'admin assignments'],
    ['/admin/notifications', 'admin notifications'],
    ['/admin/audit', 'admin audit'],
    ['/admin/simulation', 'admin simulation'],
    ['/admin/profiles', 'admin scoring profiles'],
    ['/admin/profiles/hackathon-mock-v1', 'admin profile detail'],
    ['/admin/calendar', 'admin reporting calendar'],
    ['/admin/people', 'admin users and institutions'],
    ['/admin/reviews', 'admin reviews'],
  ] as const) {
    await visit(page, 'administrator', path);
    await page.waitForLoadState('networkidle');
    await scan(page, name);
  }
  await page.goto('/admin/forms/form-v2');
  await page.getByRole('tab', { name: 'Preview as institution' }).click();
  await scan(page, 'admin form preview');
});

test('year-end screens for every role', async ({ page }) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  for (const [account, path, name] of [
    ['administrator', '/admin/annual', 'admin annual'],
    ['supervisor', '/supervisor', 'supervisor overview'],
    ['supervisor', '/supervisor/workload', 'supervisor workload'],
    ['supervisor', '/supervisor/annual', 'supervisor readiness'],
    ['supervisor', '/supervisor/reports', 'supervisor reports'],
    ['focal-demo-005', '/institution/results', 'institution results'],
    [
      'officer-b',
      '/officer/institutions/DEMO-005',
      'officer institution after year end',
    ],
  ] as const) {
    await visit(page, account, path);
    await page.waitForLoadState('networkidle');
    await scan(page, name);
  }
});
