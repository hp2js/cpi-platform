import { test, expect, type Page } from '@playwright/test';
import { api, midYear, publishedYear, signInAs, visit } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/** Opens DEMO-002 Q1 revision 2 from the officer's finalized queue. */
async function openDemo2Q1(page: Page) {
  await visit(page, 'officer-a', '/officer?tab=finalized');
  await page
    .getByRole('link', { name: /^DEMO-002 , review Q1 revision 2/ })
    .click();
  await expect(
    page.getByRole('heading', { name: /Implementation result for Q1/ }),
  ).toBeVisible();
}

test('open work shows whose move it is; finalized work shows when it was finished, not a growing wait (HP2-48)', async ({
  page,
}) => {
  await midYear(page);
  await visit(page, 'officer-a', '/officer');
  const open = page.getByRole('table', {
    name: 'Submissions awaiting review, oldest first',
  });
  await expect(open.getByText('On the officer').first()).toBeVisible();

  await publishedYear(page);
  await visit(page, 'officer-a', '/officer?tab=finalized');
  const finalized = page.getByRole('table', { name: 'Finalized submissions' });
  await expect(
    finalized.getByRole('columnheader', { name: 'Finalized' }),
  ).toBeVisible();
  await expect(
    finalized.getByRole('columnheader', { name: 'Waiting' }),
  ).toHaveCount(0);
  await expect(finalized.getByText('On the officer')).toHaveCount(0);
  const demo2 = finalized.getByRole('row', { name: /DEMO-002.*Q1 · r2/ });
  await expect(demo2).toContainText('9 Oct 2026');
});

test('a superseded revision reads as history, apart from the quarter’s current status (HP2-50)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  await openDemo2Q1(page);
  await page
    .getByRole('navigation', { name: 'Revisions' })
    .getByRole('link', { name: /^r1/ })
    .click();
  await expect(
    page.getByText('Revision 1 was superseded by revision 2'),
  ).toBeVisible();
  await expect(page.getByText('Superseded revision · read only')).toBeVisible();
  await expect(
    page.getByText('No decision recorded on this revision').first(),
  ).toBeVisible();
  await expect(page.getByText(/Awaiting the officer’s decision/)).toHaveCount(
    0,
  );
  await expect(page.getByText(/No result: revision 2 replaced/)).toBeVisible();
  await page.getByRole('link', { name: 'Open revision 2' }).click();
  await expect(page.getByText(/superseded by/)).toHaveCount(0);
});

test('reopening a published review explains the correction case first (HP2-51)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await publishedYear(page);
  await openDemo2Q1(page);
  const reopen = page.getByRole('region', { name: 'Reopening this review' });
  await expect(reopen).toContainText(
    "DEMO-002's annual result is published. An administrator must open a correction case for Q1",
  );
  await expect(page.getByLabel('Reason for reopening')).toHaveCount(0);

  // A case for another quarter does not unlock this one, and says so.
  await signInAs(page, 'administrator');
  await api(page, '/api/annual/corrections', {
    method: 'POST',
    json: {
      institutionId: 'DEMO-002',
      periodId: 'FY2026-27-Q2',
      reason: 'Q2 evidence was misread during review.',
    },
  });
  await openDemo2Q1(page);
  await expect(
    page.getByRole('region', { name: 'Reopening this review' }),
  ).toContainText('is for Q2, not Q1');
});
