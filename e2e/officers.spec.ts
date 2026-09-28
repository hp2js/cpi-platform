import { test, expect } from '@playwright/test';
import { midYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('an officer reads its portfolio trend and the rules in use', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'officer-a', '/officer');
  await page.getByRole('link', { name: 'My portfolio' }).click();
  await expect(
    page.getByRole('heading', { name: 'Quarter by quarter' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Finalized quarterly implementation' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Rules in use' }).click();
  await expect(
    page.getByRole('heading', { name: /Scoring profile: Hackathon Mock v1/ }),
  ).toBeVisible();
});

test('an officer declares a conflict of interest and the administrator reassigns', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'officer-a', '/officer/institutions/DEMO-003');
  const assignment = page.getByRole('region', { name: 'Your assignment' });
  await expect(assignment).toContainText('Supervisor');
  await assignment
    .getByRole('button', { name: 'Declare a conflict of interest' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('What is the conflict?')
    .fill('My brother is the Accounting Officer there.');
  await dialog.getByRole('button', { name: 'Send declaration' }).click();
  await expect(assignment).toContainText('waiting for the administrator');

  await visit(page, 'administrator', '/admin/assignments');
  const requests = page.getByRole('region', { name: /Reassignment requests/ });
  await expect(requests).toContainText(
    'Conflict of interest: DEMO-003 Demo County Licensing Office. Prevention Officer A asks not to review it.',
  );
  await requests.getByRole('button', { name: /Apply/ }).click();
  const reassign = page.getByRole('region', {
    name: 'Reassign an institution',
  });
  await expect(reassign).toContainText('conflict-of-interest declaration');
  await reassign.getByRole('button', { name: 'Reassign' }).click();
  await expect(requests).toBeHidden();
});

test('temporary cover shows the covering officer who they cover for and the handover note', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'administrator', '/admin/assignments');
  const reassign = page.getByRole('region', {
    name: 'Reassign an institution',
  });
  await reassign
    .getByRole('combobox', { name: 'Institution', exact: true })
    .click();
  await page.getByRole('option', { name: /DEMO-004/ }).click();
  await reassign.getByLabel('Reason').fill('Officer A on annual leave.');
  await reassign.getByLabel(/Temporary cover/).check();
  await reassign.getByLabel('Cover ends on').fill('2026-10-30');
  await reassign
    .getByLabel('Handover note (optional)')
    .fill('The Q2 baseline proposal looks inflated; check fragmentation.');
  await reassign.getByRole('button', { name: 'Start cover' }).click();
  await expect(reassign.getByLabel('Reason')).toHaveValue('');

  await visit(page, 'officer-b', '/officer/institutions/DEMO-004');
  const assignment = page.getByRole('region', { name: 'Your assignment' });
  await expect(
    assignment.getByText('You are covering for Prevention Officer A'),
  ).toBeVisible();
  await expect(assignment).toContainText(
    'The Q2 baseline proposal looks inflated; check fragmentation.',
  );
});
