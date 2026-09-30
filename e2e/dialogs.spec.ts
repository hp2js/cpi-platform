import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';

async function withinViewport(page: Page, dialog: Locator) {
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 340 },
  { width: 844, height: 390 },
]) {
  test(`dialog fits ${viewport.width}x${viewport.height} and retains keyboard behavior`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/sign-in');
    const trigger = page.getByRole('button', { name: /Sign in with eCitizen/ });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await withinViewport(page, dialog);
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    // The footer remains reachable even when the description needs scrolling.
    await dialog
      .getByRole('button', { name: 'Close', exact: true })
      .first()
      .click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('dialog reflows at enlarged text size and keeps accessible contrast', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/sign-in');
  // Simulates user text enlargement without relying on browser-specific zoom shortcuts.
  await page.addStyleTag({ content: 'html { font-size: 175% !important; }' });
  await page.getByRole('button', { name: /Sign in with eCitizen/ }).click();
  const dialog = page.getByRole('dialog');
  await withinViewport(page, dialog);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await dialog
    .getByRole('button', { name: 'Close', exact: true })
    .first()
    .click();
  await expect(dialog).toBeHidden();
});

test('demonstration drawer fits a short phone viewport and returns focus', async ({
  page,
}) => {
  test.skip(
    process.env.CPI_PRODUCTION === 'true',
    'Demonstration accounts depend on local fixtures',
  );
  await page.setViewportSize({ width: 390, height: 340 });
  await page.goto('/sign-in');
  const trigger = page.getByRole('button', { name: /Demo accounts/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await withinViewport(page, dialog);
  await dialog
    .getByRole('button', { name: 'Copy the demo password' })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole('button', { name: 'Copy the demo password' }),
  ).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
