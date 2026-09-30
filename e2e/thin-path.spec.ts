import { test, expect, type Page } from './test';
import { passSuitability } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\nfictional minutes\n'),
});

async function signIn(page: Page, role: string, account: RegExp) {
  await page.goto('/sign-in?demo=open');
  await page
    .getByRole('region', { name: role })
    .getByRole('button', { name: account })
    .click();
  await expect(page).not.toHaveURL(/sign-in/);
}

test('publish, report, submit, review and finalize one quarter', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Administrator: invalid profile weights cannot be approved (AT03), then publish the form.
  await signIn(page, 'Administrator', /Administrator/);
  const adminNav = page.getByRole('navigation', { name: 'Administration' });
  await adminNav.getByRole('link', { name: 'Scoring profiles' }).click();
  await page.getByRole('link', { name: 'Hackathon Mock v1' }).first().click();
  await page.getByRole('button', { name: 'Copy to a new draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Hackathon Mock v1 copy' }),
  ).toBeVisible();
  await page.getByLabel('Implementation').fill('50');
  await page.getByRole('button', { name: 'Approve profile' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Approve' })
    .click();
  await expect(
    page.getByText('Indicator weights must total 100; they total 90.').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete draft' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Scoring profiles' }),
  ).toBeVisible();

  await adminNav.getByRole('link', { name: 'Reporting forms' }).click();
  await page.getByRole('link', { name: 'Version 1' }).click();
  await expect(
    page.getByText('No issues: this version can be published.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publish version 1' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Publish' })
    .click();
  await expect(page.getByText(/this version is locked/)).toBeVisible();

  // Institution: draft, recover after reload, honest declarations, attestation, receipt.
  await signIn(page, 'Institution focal person', /Focal person, DEMO-001/);
  await page.getByRole('link', { name: 'Start report' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Quarterly progress report' }),
  ).toBeVisible();

  const cpc = page.locator('#field-questions-cpc-minutes');
  await cpc.locator('input[type=file]').setInputFiles({
    name: 'minutes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('MZ\x90\x00'),
  });
  await expect(cpc.getByRole('alert')).toContainText('do not match');
  await cpc
    .locator('input[type=file]')
    .setInputFiles(pdf('cpc-minutes-q1.pdf'));
  await expect(cpc.getByText('cpc-minutes-q1.pdf')).toBeVisible();

  const iao = page.locator('#field-questions-iao-minutes');
  await iao
    .getByLabel('This document is not available for this quarter')
    .check();
  await iao
    .getByLabel('Explain why')
    .fill('IAO minutes are awaiting the chair’s signature.');

  for (const code of ['M-01', 'M-02', 'M-03', 'M-04']) {
    const card = page.getByRole('article').filter({ hasText: code });
    await card.getByLabel('Yes, completed').check();
    await card
      .getByLabel('Output achieved')
      .fill(`${code} delivered as planned.`);
    await card.getByRole('checkbox', { name: /cpc-minutes-q1\.pdf/ }).check();
    await card
      .getByLabel('Page or section in cpc-minutes-q1.pdf')
      .fill('Item 4, page 2');
  }
  await page
    .getByLabel('Emerging issues across the quarter')
    .fill('Registry staff turnover.');
  await page
    .getByLabel('Actions to address the issues')
    .fill('Recruit two registry officers.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByLabel('Emerging issues across the quarter'),
  ).toHaveValue('Registry staff turnover.');

  await page.getByRole('button', { name: 'Review and submit' }).click();
  await expect(
    page.getByRole('heading', { name: 'Every required item is answered' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Declared not available: IAO minutes/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Submit report' }).click();
  // USWDS error summary: it takes focus, and each item moves focus to its field.
  const summary = page
    .getByRole('alert')
    .filter({ hasText: 'There is a problem' });
  await expect(summary).toBeFocused();
  await expect(page.locator('#attest-authorized-error')).toHaveText(
    'Confirm that you are authorized to submit.',
  );
  await summary
    .getByRole('link', { name: 'Confirm that you are authorized to submit.' })
    .click();
  await expect(
    page.getByLabel(/I am authorized to submit this report/),
  ).toBeFocused();
  await page.getByLabel(/I am authorized to submit this report/).check();
  await page
    .getByLabel('Your role or delegation reference')
    .fill('Integrity Assurance Officer');
  await page.getByLabel('Approved; I have the reference').check();
  await page
    .getByLabel('Approval reference')
    .fill('CPC minutes 12 Sep 2026, item 4');
  await page.getByRole('button', { name: 'Submit report' }).click();

  await expect(
    page.getByRole('heading', { name: 'Submission receipt' }),
  ).toBeVisible();
  await expect(page.getByText('On time', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/A provisional calculation was recorded/),
  ).toBeVisible();
  await expect(page.getByText(/points/)).toHaveCount(0);

  // Officer: reject one unsupported claim with a reason, accept the rest, finalize.
  await signIn(page, 'Prevention officer', /Prevention Officer A/);
  await page
    .getByRole('table', { name: /Submissions awaiting review/ })
    .getByRole('link', { name: 'DEMO-001' })
    .click();
  await expect(page.getByText('60.00')).toBeVisible();
  await passSuitability(page);
  const decide = async (
    code: string,
    outcome: 'Accept' | 'Reject',
    reason = '',
  ) => {
    const card = page.getByRole('article').filter({ hasText: code });
    await card.getByLabel(new RegExp(`^${outcome}:`)).check();
    if (reason) await card.getByRole('textbox').fill(reason);
    await card.getByRole('button', { name: 'Save decision' }).click();
    await expect(card.getByText(/Saved by Prevention Officer A/)).toBeVisible();
  };
  await decide(
    'M-01',
    'Reject',
    'Minutes support the register but not the exception review.',
  );
  await decide('M-02', 'Accept');
  await decide('M-03', 'Accept');
  await decide('M-04', 'Accept');
  await expect(page.getByText('45.00')).toBeVisible();
  // The Q1 baseline is seeded for the simulated year; the officer confirms it first (AT25).
  const reviewUrl = page.url();
  await page
    .getByRole('region', { name: 'My portfolio' })
    .getByRole('link', { name: /DEMO-001/ })
    .click();
  await page
    .getByRole('button', {
      name: 'Confirm correspondence with the approved plan',
    })
    .click();
  await expect(
    page.getByText(/SEEDED HISTORICAL BASELINE · confirmed/).first(),
  ).toBeVisible();
  await page.goto(reviewUrl);
  await page.getByRole('button', { name: 'Finalize review' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Finalize' })
    .click();
  await expect(page.getByText(/Decisions are read-only/)).toBeVisible();

  // Institution: review complete, still no numbers (O06).
  await signIn(page, 'Institution focal person', /Focal person, DEMO-001/);
  await expect(page.getByText('Review complete').first()).toBeVisible();
  await expect(page.getByText(/45\.00|60\.00/)).toHaveCount(0);
  expect(errors).toEqual([]);
});
