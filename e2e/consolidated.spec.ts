import { test, expect } from '@playwright/test';
import { publishedYear, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

test('the consolidated report opens with the method, coverage and a summary of every institution (HP2-66)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  await visit(page, 'supervisor', '/supervisor/reports');

  // The method is stated once, not in every institution's section.
  await expect(
    page.getByRole('heading', { name: 'How results are calculated' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Late reporting is shown separately/),
  ).toHaveCount(1);

  const coverage = page.getByRole('region', { name: 'Coverage' });
  await expect(
    coverage.getByText('Annual release coverage', { exact: true }),
  ).toBeVisible();
  await expect(coverage.getByText('8 of 8')).toBeVisible();
  await expect(
    coverage.getByText('Closed without submission', { exact: true }),
  ).toBeVisible();

  const summary = page.getByRole('table', {
    name: /Annual results of every expected institution/,
  });
  for (const [id, points] of [
    ['DEMO-001', '88.75'],
    ['DEMO-005', '70.00'],
    ['DEMO-004', '96.25'],
  ])
    await expect(
      summary.getByRole('row', { name: new RegExp(id) }),
    ).toContainText(points);
  await expect(summary.getByRole('row', { name: /DEMO-005/ })).toContainText('0.00 (closed)');

  const publication = page.getByRole('region', { name: 'Publication' });
  await expect(publication).toContainText(/8 institutions/);
  await expect(publication).toContainText('None.');
});
