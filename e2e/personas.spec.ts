import { test, expect, type Page } from './test';
import { api, reset, signInAs, visit } from './support';

// Journeys run against the development server's mock API; production builds have no mocks.
test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function signIn(page: Page, role: string, account: RegExp) {
  await page.goto('/sign-in?demo=open');
  await page
    .getByRole('region', { name: role })
    .getByRole('button', { name: account })
    .click();
}

const personas = [
  {
    role: 'Institution focal person',
    account: /Focal person, DEMO-002/,
    path: '/institution',
    heading: 'What is due and what needs attention',
    nav: 'Institution',
  },
  {
    role: 'Prevention officer',
    account: /Prevention Officer B/,
    path: '/officer',
    heading: 'Assigned work',
    nav: 'Officer',
  },
  {
    role: 'Supervisor',
    account: /Supervisor/,
    path: '/supervisor',
    heading: 'Oversight overview',
    nav: 'Supervisor',
  },
  {
    role: 'Administrator',
    account: /Administrator/,
    path: '/admin',
    heading: 'Console',
    nav: 'Administration',
  },
] as const;

for (const persona of personas) {
  test(`${persona.role} signs in to their own layout`, async ({ page }) => {
    const errors = trackErrors(page);
    await signIn(page, persona.role, persona.account);
    await expect(page).toHaveURL(persona.path);
    await expect(
      page.getByRole('heading', { level: 1, name: persona.heading }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: persona.nav }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Simulation/).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('officer sees only the assigned portfolio, and the API refuses the rest', async ({
  page,
}) => {
  await signIn(page, 'Prevention officer', /Prevention Officer B/);
  const portfolio = page.getByRole('table', {
    name: 'Assigned institutions by quarter',
  });
  await expect(portfolio.getByRole('rowheader')).toHaveCount(4);
  await expect(portfolio.getByText('DEMO-005')).toBeVisible();
  await expect(portfolio.getByText('DEMO-001')).toHaveCount(0);
  const status = await page.evaluate(
    async () => (await fetch('/api/institutions/DEMO-001')).status,
  );
  expect(status).toBe(404);
});

test('a wrong-role address is refused', async ({ page }) => {
  await signIn(page, 'Institution focal person', /Focal person, DEMO-001/);
  await expect(page).toHaveURL('/institution');
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: "You don't have access to this page" }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to your home page' }).click();
  await expect(page).toHaveURL('/institution');
});

test('an expired session leads to a clear sign-in path', async ({ page }) => {
  await signIn(page, 'Supervisor', /Supervisor/);
  await expect(
    page.getByRole('heading', { name: 'Oversight overview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^(Mock API|Dev controls)$/ }).click();
  await page.getByRole('button', { name: 'Expire my session' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your session has expired' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Sign in again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
});

test('institution navigation moves to the bottom bar on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'Institution focal person', /Focal person, DEMO-004/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const bottomNav = page
    .getByRole('navigation', { name: 'Institution' })
    .last();
  await expect(bottomNav).toBeVisible();
  const box = await bottomNav.boundingBox();
  expect(box && box.y + box.height).toBeGreaterThan(800);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('the simulation bar follows the clock when another person advances it', async ({
  page,
  browser,
}) => {
  await reset(page);
  await visit(page, 'focal-demo-001', '/institution');
  const bar = page.getByRole('region', { name: 'Simulation status' });
  const before = await bar.locator('time').getAttribute('datetime');

  // The administrator advances business time in another browser.
  const admin = await browser.newPage();
  await admin.goto('/sign-in');
  await signInAs(admin, 'administrator');
  await api(admin, '/api/simulation/advance', {
    method: 'POST',
    json: { boundaryId: 'Q2-open' },
  });
  await admin.close();

  // Returning to the tab re-reads the session; the bar shows the new business time.
  await page.evaluate(() =>
    window.dispatchEvent(new Event('visibilitychange')),
  );
  await expect(bar.locator('time')).not.toHaveAttribute(
    'datetime',
    before ?? '',
  );

  // "About this simulation" explains the clock, the profile and the run.
  await bar.getByRole('button', { name: 'About this simulation' }).click();
  const about = page.getByRole('dialog');
  await expect(
    about.getByText('Hackathon Mock v1 · simulation profile'),
  ).toBeVisible();
  await expect(about.getByText('Run', { exact: true })).toBeVisible();
});
