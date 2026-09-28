import { test, expect } from './test';
import { midYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('a supervisor drills into an institution and suggests a reassignment the administrator applies', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'supervisor', '/supervisor/institutions');
  await page.getByRole('link', { name: 'DEMO-001', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /DEMO-001/, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Trend for this institution' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Open revision 1/ }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Suggest a reassignment/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Suggested officer').click();
  await page.getByRole('option', { name: 'Prevention Officer B' }).click();
  await dialog
    .getByLabel('Reason')
    .fill('Officer A has the oldest backlog this quarter.');
  await dialog
    .getByRole('button', { name: 'Send to the administrator' })
    .click();
  await expect(
    page.getByText(
      'A reassignment suggestion is waiting for the administrator.',
    ),
  ).toBeVisible();

  await visit(page, 'administrator', '/admin/assignments');
  const suggestions = page.getByRole('region', {
    name: /Reassignment requests/,
  });
  await expect(suggestions).toContainText(
    'DEMO-001 Demo Appointments Service Agency: Prevention Officer A → Prevention Officer B',
  );
  await suggestions.getByRole('button', { name: /Apply/ }).click();
  const reassign = page.getByRole('region', {
    name: 'Reassign an institution',
  });
  await expect(reassign).toContainText('Applying Supervisor’s suggestion');
  await reassign.getByRole('button', { name: 'Reassign' }).click();
  await expect(suggestions).toBeHidden();

  await visit(page, 'supervisor', '/supervisor/assignments');
  await expect(
    page.getByRole('region', { name: 'Reassignment requests' }),
  ).toContainText('Applied');
});

test('a supervisor comment is answered and marked addressed by the officer', async ({
  page,
}) => {
  const { review } = await midYear(page);
  await visit(page, 'supervisor', `/supervisor/reviews/${review}`);
  await page
    .getByLabel('Add a comment')
    .fill('Please confirm the CPC minutes are signed.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  const comments = page.getByRole('region', { name: 'Oversight comments' });
  await expect(comments.getByText('Open', { exact: true })).toBeVisible();

  await visit(page, 'officer-a', `/officer/reviews/${review}`);
  await expect(
    page.getByText(/The supervisor left 1 open oversight comment/),
  ).toBeVisible();
  await comments
    .getByRole('button', { name: 'Reply or mark addressed' })
    .click();
  await comments.getByLabel('Reply').fill('Checked: signed and dated.');
  await comments.getByLabel('Mark the comment addressed').check();
  await comments.getByRole('button', { name: 'Send reply' }).click();
  await expect(comments.getByText(/^Addressed/)).toBeVisible();

  await visit(page, 'supervisor', '/supervisor/inbox');
  await expect(page.getByText(/Comment addressed: DEMO-001 Q1/)).toBeVisible();
});

test('supervisors read the rules officers apply', async ({ page }) => {
  await midYear(page);
  await visit(page, 'supervisor', '/supervisor/rules');
  await expect(
    page.getByRole('heading', { name: /Scoring profile: Hackathon Mock v1/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('main')
      .getByText('Simulation profile', { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText('Scored').first()).toBeVisible();
});
