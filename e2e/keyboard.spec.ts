import { test, expect, type Page } from './test';
import { midYear, passSuitability, signInAs } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/** The focused element must show a visible indicator: an outline or a focus ring (WCAG 2.4.7). */
async function expectVisibleFocus(page: Page) {
  const indicator = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    // After the last element, Tab can move focus to the browser itself; that is not an app stop.
    if (!element || element === document.body) return 'visible';
    const style = getComputedStyle(element);
    const outlined =
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const ringed = style.boxShadow !== 'none';
    return outlined || ringed
      ? 'visible'
      : `invisible on ${element.tagName} “${element.textContent?.slice(0, 40)}”`;
  });
  expect(indicator).toBe('visible');
}

/** Tabs forward until the focused element's text matches, checking the indicator at each stop. */
async function tabTo(page: Page, text: string, limit = 80) {
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page);
    if (
      (
        await page.evaluate(() => document.activeElement?.textContent ?? '')
      ).includes(text)
    )
      return;
  }
  throw new Error(`“${text}” was not reachable by keyboard`);
}

test('sign in, skip navigation and complete part of a report without a mouse', async ({
  page,
}) => {
  await midYear(page);
  await page.evaluate(() => fetch('/api/session', { method: 'DELETE' }));
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  // Wait for the demo button, so focus is not placed while the page is still loading.
  await expect(
    page.getByRole('button', { name: /Explore with a demonstration account/ }),
  ).toBeVisible();

  // The skip link is the first stop and moves focus to the main content.
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to content' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();

  // The demonstration accounts open in a drawer from the panel under the sign-in card.
  await tabTo(page, 'Explore with a demonstration account');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Focal person, DEMO-003/ }),
  ).toBeVisible();
  await tabTo(page, 'Focal person, DEMO-003');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'What is due and what needs attention' }),
  ).toBeVisible();

  // Wait for the next-action card too, so tabbing does not run past it while it loads.
  await expect(
    page.getByRole('link', { name: /Start report/ }).first(),
  ).toBeVisible();
  await tabTo(page, 'Start report');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Quarterly progress report' }),
  ).toBeVisible();

  // Answer the first milestone, type its output and save, all from the keyboard.
  await page.getByRole('radio', { name: 'Yes, completed' }).first().focus();
  await expectVisibleFocus(page);
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('radio', { name: 'Yes, completed' }).first(),
  ).toBeChecked();
  await tabTo(page, '', 3);
  await page.getByLabel('Output achieved').first().focus();
  await page.keyboard.type('Inspection schedule published.');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).focus();
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Draft saved/)).toBeVisible();
});

test('an officer records a decision with the keyboard', async ({ page }) => {
  const { review } = await midYear(page);
  await signInAs(page, 'officer-a');
  await page.goto(`/officer/reviews/${review}`);
  await passSuitability(page);
  const card = page.getByRole('article', { name: /^M-01 / });
  const accept = card.getByRole('radio', { name: /^Accept:/ });
  await accept.focus();
  await expectVisibleFocus(page);
  // Arrow keys move between the radios in the group; Space selects the focused one.
  await page.keyboard.press('ArrowDown');
  await expect(card.getByRole('radio', { name: /^Reject:/ })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(accept).toBeFocused();
  await page.keyboard.press('Space');
  await expect(accept).toBeChecked();
  await card.getByRole('button', { name: 'Save decision' }).focus();
  await expectVisibleFocus(page);
  await page.keyboard.press('Enter');
  await expect(card.getByText(/Saved by Prevention Officer A/)).toBeVisible();
});

test('dialogs trap focus and return it on Escape; the account menu works from the keyboard', async ({
  page,
}) => {
  await midYear(page);
  await signInAs(page, 'administrator');
  await page.goto('/admin/forms/form-v2');
  const publish = page.getByRole('button', { name: /Publish version 2/ });
  // Enabled once the server has checked the draft.
  await expect(publish).toBeEnabled();
  await publish.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(publish).toBeFocused();

  const menu = page.getByRole('button', { name: /Account menu/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  // My account comes first, then Sign out.
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
});

test('evidence checks start unanswered and cannot be saved half done', async ({
  page,
}) => {
  const { review } = await midYear(page);
  await signInAs(page, 'officer-a');
  await page.goto(`/officer/reviews/${review}`);
  const section = page.getByRole('region', { name: 'Evidence suitability' });
  // A file is never passed by default (PRD §11): no outcome is pre-selected.
  await expect(section.getByRole('radio', { checked: true })).toHaveCount(0);
  await section
    .getByRole('button', { name: /^Save checks/ })
    .first()
    .click();
  await expect(
    section.getByText('Choose Pass, Deficient or Not applicable'),
  ).toHaveCount(5);
  // Focus lands on the first unanswered check.
  await expect(
    section.getByRole('radio', { name: 'Pass' }).first(),
  ).toBeFocused();
  await expect(
    section.getByText('Suitability not checked').first(),
  ).toBeVisible();
});

test('an unsaved decision is flagged and not lost on leaving', async ({
  page,
}) => {
  const { review } = await midYear(page);
  await signInAs(page, 'officer-a');
  await page.goto(`/officer/reviews/${review}`);
  const card = page.getByRole('article', { name: /^M-01 / });
  // Before the file is checked, the card says why accepting would be refused.
  await expect(card.getByText(/before accepting/)).toBeVisible();
  await passSuitability(page);
  await expect(card.getByText(/before accepting/)).toBeHidden();
  await card.getByRole('radio', { name: /^Accept:/ }).check();
  await expect(card.getByText('Unsaved choice')).toBeVisible();
  const progress = page.getByRole('navigation', { name: 'Review progress' });
  await expect(progress.getByText('Not saved: M-01')).toBeVisible();
  // Leaving asks first; staying keeps the choice.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.getByRole('link', { name: 'Queue' }).click();
  await expect(card.getByRole('radio', { name: /^Accept:/ })).toBeChecked();
  await card.getByRole('button', { name: 'Save decision' }).click();
  await expect(card.getByText('Unsaved choice')).toBeHidden();
  await expect(progress.getByText(/Not saved/)).toBeHidden();
});
