import { test, expect, type Page } from './test';
import { api, reset, signInAs, submitQ1 } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/** Arms the development fault injector for the next request whose path contains `path`. */
const fault = (
  page: Page,
  kind: 'network' | 'server' | 'drop-response',
  path: string,
) => api(page, '/api/__mock/fault', { method: 'POST', json: { kind, path } });

async function openEditor(page: Page, institution = 'focal-demo-003') {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await signInAs(page, institution);
  await page.goto('/institution/reports/FY2026-27-Q1');
  await expect(
    page.getByRole('heading', { name: 'Quarterly progress report' }),
  ).toBeVisible();
}

test('a lost connection keeps entries and a retry saves them', async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByLabel('Emerging issues across the quarter')
    .fill('Registry staff turnover.');
  await fault(page, 'network', '/draft');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(
    page.getByText(/The connection was interrupted\. Your entries are kept/),
  ).toBeVisible();
  await expect(
    page.getByLabel('Emerging issues across the quarter'),
  ).toHaveValue('Registry staff turnover.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
});

test('an expired session keeps entries; saving works again after signing in', async ({
  page,
}) => {
  await openEditor(page);
  await page
    .getByLabel('Emerging issues across the quarter')
    .fill('Written before the session expired.');
  await api(page, '/api/__mock/expire-session', { method: 'POST' });
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(
    page.getByText('Your session has expired. Sign in again to continue.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in again in a new tab' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Emerging issues across the quarter'),
  ).toHaveValue('Written before the session expired.');
  await signInAs(page, 'focal-demo-003');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
});

test('a failed upload is explained and retried without duplicating the file', async ({
  page,
}) => {
  await openEditor(page);
  const cpc = page.locator('#field-questions-cpc-minutes');
  await fault(page, 'network', '/evidence');
  await cpc.locator('input[type=file]').setInputFiles({
    name: 'minutes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 minutes'),
  });
  await expect(cpc.getByRole('alert')).toContainText(
    'The upload was interrupted',
  );
  await cpc.getByRole('button', { name: 'Try again' }).click();
  await expect(cpc.getByText('minutes.pdf')).toBeVisible();
  // A second attempt with the same file returns the completed record rather than a duplicate.
  await cpc
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'minutes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 minutes'),
    });
  await expect(cpc.getByText('minutes.pdf')).toHaveCount(1);
});

test('a submit whose response is lost is retried safely: one receipt, one revision (AT06)', async ({
  page,
}) => {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await submitQ1(page, 'DEMO-004').catch(() => undefined);
  // Start again from a saved, complete draft for DEMO-006 and submit through the UI.
  await signInAs(page, 'focal-demo-006');
  const obligation = encodeURIComponent('DEMO-006:FY2026-27-Q1');
  const bundle = await api<{ baseline: { milestones: { id: string }[] } }>(
    page,
    `/api/obligations/${obligation}/report`,
  );
  const answers = {
    questions: {
      'cpc-minutes': {
        evidenceIds: [],
        unavailable: { explanation: 'Minutes are awaiting signature.' },
      },
      'iao-minutes': {
        evidenceIds: [],
        unavailable: { explanation: 'Minutes are awaiting signature.' },
      },
      'emerging-issues': 'None.',
      'actions-planned': 'None.',
      remarks: '',
    },
    milestones: Object.fromEntries(
      bundle.baseline.milestones.map((milestone) => [
        milestone.id,
        {
          completed: false,
          output: '',
          emergingIssues: 'Deferred to Q2.',
          actions: 'Scheduled.',
          evidence: [],
          evidenceUnavailable: null,
        },
      ]),
    ),
  };
  await api(page, `/api/obligations/${obligation}/draft`, {
    method: 'PUT',
    json: { baseVersion: 0, answers },
  });
  await page.goto('/institution/reports/FY2026-27-Q1/review');
  await page.getByLabel(/I am authorized to submit/).check();
  await page
    .getByLabel('Your role or delegation reference')
    .fill('Integrity Assurance Officer');
  await page.getByLabel('Approval is not available').check();
  await page
    .getByLabel('Why approval is not available')
    .fill('The CPC has not met since the quarter ended.');
  await fault(page, 'drop-response', '/submit');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText(/You can try again safely/)).toBeVisible();
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission receipt' }),
  ).toBeVisible();
  const receipts = await api<{ revision: number }[]>(page, '/api/receipts');
  expect(receipts.map((receipt) => receipt.revision)).toEqual([1]);
});

test('a draft changed in another tab is not overwritten', async ({
  page,
  context,
}) => {
  await openEditor(page);
  await page.getByLabel('Emerging issues across the quarter').fill('Tab one.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();

  const second = await context.newPage();
  await second.goto('/institution/reports/FY2026-27-Q1');
  await expect(
    second.getByLabel('Emerging issues across the quarter'),
  ).toHaveValue('Tab one.');
  await second
    .getByLabel('Emerging issues across the quarter')
    .fill('Tab two.');
  await second.getByRole('button', { name: 'Save draft' }).click();
  await expect(second.getByText(/Draft saved/)).toBeVisible();

  // The first tab still holds version 1; its save is refused instead of overwriting tab two.
  await page
    .getByLabel('Emerging issues across the quarter')
    .fill('Tab one, edited later.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('This draft changed elsewhere')).toBeVisible();
  await page
    .getByRole('button', { name: 'Load the latest saved draft' })
    .click();
  await expect(
    page.getByLabel('Emerging issues across the quarter'),
  ).toHaveValue('Tab two.');
});
