import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './test';
import { api, reset, signInAs } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

const DEMO_PASSWORD = 'Demo-Password-2026';

async function signOut(page: Page) {
  await api(page, '/api/session', { method: 'DELETE' });
}

/** The newest match of `pattern` in the email sink for an address (read as the administrator). */
async function emailed(page: Page, email: string, pattern: RegExp) {
  await signInAs(page, 'administrator');
  const mails = await api<{ to: string; body: string }[]>(
    page,
    '/api/admin/email-sink',
  );
  const found = mails
    .filter((mail) => mail.to === email)
    .map((mail) => pattern.exec(mail.body)?.[1])
    .find(Boolean);
  if (!found)
    throw new Error(`Nothing matching ${pattern} emailed to ${email}`);
  return found;
}

async function submitPassword(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Both steps: the password, then the code from the email. */
async function signInWithPassword(page: Page, email: string, password: string) {
  await submitPassword(page, email, password);
  await expect(page.getByLabel('Sign-in code')).toBeVisible();
  const code = await emailed(page, email, /Your sign-in code is (\d{6})/);
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
}

/** Opens the newest emailed link for an address from the admin's demo email sink. */
async function openEmailedLink(page: Page, email: string, subject: string) {
  await signInAs(page, 'administrator');
  await page.goto('/admin/notifications?tab=sink');
  const message = page
    .getByRole('listitem')
    .filter({ hasText: subject })
    .filter({ hasText: `To ${email}` })
    .first();
  await message.getByRole('link', { name: /\/set-password\?token=/ }).click();
}

async function choosePassword(page: Page, password: string, button: string) {
  await page.getByLabel(/^(New password|Password)$/).fill(password);
  await page.getByLabel('Confirm the password').fill(password);
  await page.getByRole('button', { name: button }).click();
}

test.beforeEach(async ({ page }) => {
  await reset(page);
  await signOut(page);
});

test(
  'email and password sign-in, with one message for any mistake',
  { tag: '@core' },
  async ({ page }) => {
    await submitPassword(page, 'officer.a@example.invalid', 'not-it');
    await expect(
      page.getByText('The email or password is not right.'),
    ).toBeVisible();
    await submitPassword(page, 'nobody@example.invalid', DEMO_PASSWORD);
    await expect(
      page.getByText('The email or password is not right.'),
    ).toBeVisible();

    // The published demo password is shown in the demonstration overlay.
    await page
      .getByRole('button', { name: /Explore with a demonstration account/ })
      .click();
    await expect(
      page.getByRole('dialog').getByText(DEMO_PASSWORD),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/demo=open/);
    await signInWithPassword(page, 'officer.a@example.invalid', DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/officer$/);
  },
);

test('a right password still needs the emailed code', async ({ page }) => {
  await submitPassword(page, 'officer.b@example.invalid', DEMO_PASSWORD);
  await expect(
    page.getByText('We emailed a 6-digit code to officer.b@example.invalid'),
  ).toBeVisible();
  await expect(page.getByLabel('Sign-in code')).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const code = await emailed(
    page,
    'officer.b@example.invalid',
    /Your sign-in code is (\d{6})/,
  );
  await signOut(page);
  await page
    .getByLabel('Sign-in code')
    .fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByText('That code is not right.')).toBeVisible();
  await page.getByLabel('Sign-in code').fill(code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/officer$/);
});

test('eCitizen is presented as planned, not connected', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Sign in with eCitizen/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Sign in with eCitizen: planned' }),
  ).toBeVisible();
  await expect(dialog).toContainText('not connected in this demonstration');
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toBeHidden();
});

test('an invited user signs in with the emailed temporary password and replaces it', async ({
  page,
}) => {
  await signInAs(page, 'administrator');
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Add user' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Prevention officer' }).click();
  await dialog.getByLabel('Name').fill('Wanjiru Demo');
  await dialog
    .getByLabel('Email (sign-in)')
    .fill('wanjiru.demo@example.invalid');
  await dialog.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Wanjiru Demo was added and invited by email',
  );
  const row = page.getByRole('row', { name: /Wanjiru Demo/ });
  await expect(row.getByText('Invited', { exact: true })).toBeVisible();
  await expect(
    row.getByRole('button', { name: /Resend invitation/ }),
  ).toBeVisible();

  // Invited accounts are not offered as demo accounts until they finish setting up.
  await signOut(page);
  await page.goto('/sign-in?demo=open');
  await expect(
    page.getByRole('heading', { name: 'Prevention officer' }),
  ).toBeVisible();
  await expect(page.getByText('Wanjiru Demo')).toBeHidden();

  const temporary = await emailed(
    page,
    'wanjiru.demo@example.invalid',
    /Temporary password: (\S+)/,
  );
  await signOut(page);
  await signInWithPassword(page, 'wanjiru.demo@example.invalid', temporary);
  await expect(page).toHaveURL(/\/choose-password$/);
  await expect(
    page.getByRole('heading', { name: 'Choose your password' }),
  ).toBeVisible();
  await expect(page.getByText('Welcome, Wanjiru Demo.')).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  // Other pages wait until the password is replaced.
  await page.goto('/officer');
  await expect(page).toHaveURL(/\/choose-password$/);

  // The rules update as the person types, and the button waits for a good password.
  await page.getByLabel('New password', { exact: true }).fill('password1234');
  await expect(
    page.getByRole('button', { name: 'Save password and continue' }),
  ).toBeDisabled();
  await choosePassword(
    page,
    'tea garden morning walk',
    'Save password and continue',
  );
  await expect(page).toHaveURL(/\/officer$/);

  // The temporary password no longer works; the chosen one does.
  await signOut(page);
  await submitPassword(page, 'wanjiru.demo@example.invalid', temporary);
  await expect(
    page.getByText('The email or password is not right.'),
  ).toBeVisible();
  await signInWithPassword(
    page,
    'wanjiru.demo@example.invalid',
    'tea garden morning walk',
  );
  await expect(page).toHaveURL(/\/officer$/);
});

test('forgot password sends a one-hour link that sets a new password', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('focal.demo-002@example.invalid');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(
    page.getByRole('heading', { name: 'Reset your password' }),
  ).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(
    'focal.demo-002@example.invalid',
  );
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(
    'If an account uses that email',
  );

  await openEmailedLink(
    page,
    'focal.demo-002@example.invalid',
    'Reset your CPI Platform password',
  );
  await expect(
    page.getByRole('heading', { name: 'Choose a new password' }),
  ).toBeVisible();
  await choosePassword(
    page,
    'river stone lantern bridge',
    'Save password and sign in',
  );
  await expect(page).toHaveURL(/\/institution$/);

  await signOut(page);
  await submitPassword(page, 'focal.demo-002@example.invalid', DEMO_PASSWORD);
  await expect(
    page.getByText('The email or password is not right.'),
  ).toBeVisible();
  await signInWithPassword(
    page,
    'focal.demo-002@example.invalid',
    'river stone lantern bridge',
  );
  await expect(page).toHaveURL(/\/institution$/);
});

test('people change their own password on My account', async ({ page }) => {
  await signInAs(page, 'focal-demo-001');
  await page.goto('/institution/account');
  await page.getByLabel('Current password').fill('wrong password');
  await page
    .getByLabel('New password', { exact: true })
    .fill('quiet harbour evening light');
  await page
    .getByLabel('Confirm the new password')
    .fill('quiet harbour evening light');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Your current password is not right.'),
  ).toBeVisible();
  await page.getByLabel('Current password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password is changed.')).toBeVisible();

  await signOut(page);
  await signInWithPassword(
    page,
    'focal.demo-001@example.invalid',
    'quiet harbour evening light',
  );
  await expect(page).toHaveURL(/\/institution$/);
});
