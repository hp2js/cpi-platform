import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';
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

/** Waits for an opening animation to finish, so contrast is measured at full opacity. */
async function settled(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        element
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === 'finished'),
      ),
    )
    .toBe(true);
}

test('public pages', async ({ page }) => {
  await openApp(page);
  await page.goto('/sign-in');
  await expect(
    page.getByRole('button', { name: /Explore with a demonstration account/ }),
  ).toBeVisible();
  await scan(page, 'sign-in');
  await page
    .getByRole('button', { name: /Explore with a demonstration account/ })
    .click();
  await settled(page.getByRole('dialog'));
  await scan(page, 'demonstration accounts');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Sign in with eCitizen/ }).click();
  await settled(page.getByRole('dialog'));
  await scan(page, 'eCitizen dialog');
  await page.keyboard.press('Escape');
  await page.goto('/forgot-password');
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await scan(page, 'forgot-password');
  await page.goto('/set-password?token=not-a-real-token');
  await expect(
    page.getByRole('heading', { name: 'This link cannot be used' }),
  ).toBeVisible();
  await scan(page, 'set-password (invalid link)');
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
    ['officer-a', '/officer/portfolio', 'officer portfolio'],
    ['officer-a', '/officer/rules', 'officer rules in use'],
    ['supervisor', '/supervisor/submissions', 'supervisor submissions'],
    [
      'supervisor',
      `/supervisor/reviews/${review}`,
      'supervisor review (read only)',
    ],
    ['supervisor', '/supervisor/evidence', 'supervisor evidence lookup'],
    ['supervisor', '/supervisor/institutions', 'supervisor institutions'],
    [
      'supervisor',
      '/supervisor/institutions/DEMO-003',
      'supervisor institution page',
    ],
    ['supervisor', '/supervisor/assignments', 'supervisor assignments'],
    ['supervisor', '/supervisor/rules', 'supervisor rules'],
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
    ['/admin/institutions', 'admin institutions'],
    ['/admin/institutions?tab=types', 'admin institution types'],
    ['/admin/institutions/DEMO-001', 'admin institution page'],
    ['/admin/users', 'admin users'],
    ['/admin/account', 'my account'],
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

test('configuration dialogs and searchable selects', async ({ page }) => {
  await openApp(page);
  await visit(page, 'administrator', '/admin/institutions');
  await page.getByRole('button', { name: 'Import from CSV' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('CSV file')
    .setInputFiles({
      name: 'institutions.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'institution_id,name,type,officer_email,ao_name,ao_designation\nMDA-401,Demo Board,State agency,officer.a@example.invalid,AO MDA-401,Director\nDEMO-001,Duplicate,State agency,nobody@example.invalid,AO,Director\n',
      ),
    });
  await expect(page.getByText(/1 ready, 1 row needs attention/)).toBeVisible();
  await scan(page, 'import preview dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add institution' }).click();
  await settled(page.getByRole('dialog'));
  await scan(page, 'add institution dialog');
  await page.keyboard.press('Escape');

  await visit(page, 'administrator', '/admin/assignments');
  await page
    .getByRole('region', { name: 'Reassign an institution' })
    .getByRole('combobox', { name: 'Institution', exact: true })
    .click();
  await settled(page.getByRole('dialog'));
  await scan(page, 'open searchable select');
  await page.keyboard.press('Escape');

  await visit(page, 'administrator', '/admin/calendar');
  await page.getByRole('radio', { name: 'Working days' }).click();
  await scan(page, 'calendar with working days');
});
