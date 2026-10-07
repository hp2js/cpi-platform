import { readFileSync } from 'node:fs';
import { test, expect } from './test';
import { api, reset, signInAs, submitQ1, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

// The evaluation set's minutes with embedded instructions to a model (PRD §14, §13).
const injection = [
  ...readFileSync(
    'docs/assistant-evaluation/files/E04_cpc_minutes_injection.pdf',
  ),
];

test('the officer asks about one file, then accepts, amends and dismisses suggestions; the supervisor reads them', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await submitQ1(page, 'DEMO-001', {
    name: 'cpc-minutes-q1.pdf',
    bytes: injection,
    passage: 'MIN. CPC/01',
  });

  // Administrator turns the assistant on.
  await visit(page, 'administrator', '/admin/assistant');
  await expect(
    page.getByRole('heading', { name: 'The evidence assistant is off' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(
    page.getByRole('heading', { name: 'The evidence assistant is on' }),
  ).toBeVisible();

  // Officer asks about the file; review goes on meanwhile.
  await signInAs(page, 'officer-a');
  const [item] = await api<{ submissionId: string }[]>(page, '/api/reviews');
  await page.goto(`/officer/reviews/${item!.submissionId}`);
  await page
    .getByRole('button', { name: /Ask the evidence assistant/ })
    .click();
  const panel = page.getByRole('region', { name: /Evidence assistant/ });
  await expect(
    panel.getByText(/read like instructions to an automated reviewer/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/AI-generated suggestions/)).toBeVisible();
  await expect(panel.getByText(/full marks/)).toHaveCount(0);

  const cards = panel.getByRole('listitem');
  await cards.nth(0).getByRole('button', { name: 'Accept' }).click();
  await expect(cards.nth(0).getByText('Accepted')).toBeVisible();
  await cards.nth(1).getByRole('button', { name: 'Amend' }).click();
  await cards
    .nth(1)
    .getByLabel('Your wording')
    .fill('Meeting held 24 Sep 2026.');
  await cards
    .nth(1)
    .getByRole('button', { name: 'Save amended suggestion' })
    .click();
  await expect(cards.nth(1).getByText('Amended')).toBeVisible();
  await cards.nth(2).getByRole('button', { name: 'Dismiss' }).click();
  await expect(cards.nth(2).getByText('Dismissed')).toBeVisible();

  // The checks show the AI's findings; Use fills one check, and nothing is saved until the officer saves.
  const checks = page.getByRole('region', { name: 'Evidence suitability' });
  await expect(checks.getByText(/AI suggests Pass:/).first()).toBeVisible();
  await checks
    .getByRole('button', {
      name: 'Use the AI suggestion for Matches the institution',
    })
    .click();
  await expect(
    checks
      .getByRole('group', { name: 'Matches the institution' })
      .getByRole('radio', { name: 'Pass' }),
  ).toBeChecked();
  await expect(checks.getByText('Suitability not checked')).toBeVisible();

  // Jump to the passage in the file.
  await panel
    .getByRole('button', { name: /Open the file at page 1/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Supervisor reads the same suggestions and decisions, and cannot act.
  await signInAs(page, 'supervisor');
  await page.goto(`/supervisor/reviews/${item!.submissionId}`);
  const read = page.getByRole('region', { name: /Evidence assistant/ });
  await expect(read.getByText('Accepted')).toBeVisible();
  await expect(read.getByText('Amended')).toBeVisible();
  await expect(read.getByText('Dismissed')).toBeVisible();
  await expect(read.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(
    read.getByRole('button', { name: /Ask the evidence assistant/ }),
  ).toHaveCount(0);
});
