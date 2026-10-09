import { test, expect } from '@playwright/test';
import { publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('an administrator brands the annual report with a live preview; published reports keep their identity (HP2-65)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);

  // Published under the fictional default identity.
  await visit(page, 'focal-demo-001', '/institution/results');
  const cover = page.getByRole('region', { name: 'Report cover' }).first();
  await expect(cover).toContainText('Adili Online');
  await expect(cover).toContainText('DEMO-001 · ');
  await expect(
    page
      .getByText(
        'Simulation with fictional institutions and data. Not an official EACC publication.',
      )
      .first(),
  ).toBeVisible();

  await visit(page, 'administrator', '/admin/report-identity');
  const preview = page.getByRole('region', {
    name: 'Preview with sample data',
  });
  await page
    .getByLabel('Issuing organization')
    .fill('Demo County Oversight Office (fictional)');
  await expect(preview).toContainText(
    'Demo County Oversight Office (fictional)',
  );

  // A colour that would fail contrast is refused, with the reason at the field.
  await page
    .getByRole('textbox', { name: 'Accent colour', exact: true })
    .fill('#FFDD00');
  await expect(page.getByText(/too light: choose darker/)).toBeVisible();
  await page.getByRole('button', { name: 'Save identity' }).click();
  await expect(page.getByText(/contrast of .*:1 on white/)).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Accent colour', exact: true })
    .fill('#1B4D3E');

  // An official name needs a recorded authorization.
  await page
    .getByLabel("Authorization to issue in an official body's name (optional)")
    .fill('');
  await page.getByLabel('Report title').fill('EACC Annual Assessment');
  await page.getByRole('button', { name: 'Save identity' }).click();
  await expect(
    page.getByText(/Record the authorization/).first(),
  ).toBeVisible();
  await page
    .getByLabel('Report title')
    .fill('County Corruption Prevention Review');

  await page.getByLabel('Sign the report').check();
  await page.getByLabel('Signatory name').fill('A. Example');
  await page.getByLabel('Signatory title').fill('Head of Oversight');
  await page.getByRole('button', { name: 'Save identity' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  await page.getByLabel('Logo').setInputFiles('e2e/fixtures/report-logo.png');
  await expect(page.getByText(/In use: 160 × 64 px/)).toBeVisible();
  await expect(
    preview.getByRole('img', { name: /Demo County Oversight Office/ }),
  ).toBeVisible();
  await expect(preview).toContainText('A. Example');

  // The published report keeps the identity it was published with.
  await visit(page, 'focal-demo-001', '/institution/results');
  await expect(
    page.getByRole('region', { name: 'Report cover' }).first(),
  ).toContainText('Adili Online');
  await expect(page.getByText('A. Example')).toHaveCount(0);
  // The simulation marking is always there, whatever the branding.
  await expect(
    page.getByText(/simulation profile, not official EACC scoring/).first(),
  ).toBeVisible();
});
