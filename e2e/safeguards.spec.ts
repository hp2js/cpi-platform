import { test, expect, type Page } from '@playwright/test';
import { passSuitability } from './support';

test.skip(
  process.env.CPI_PRODUCTION === 'true',
  'Mock API journeys run against the development stack',
);

/** Loads the app and waits until the mock API worker is serving requests. */
async function openApp(page: Page) {
  await page.goto('/sign-in');
  // The app renders only after the worker has started, so this proves the mock is live.
  await expect(
    page.getByRole('heading', { name: 'Prevention officer' }),
  ).toBeVisible();
}

/** Calls the mock API from inside the page, so the service worker handles it. */
async function api(
  page: Page,
  path: string,
  init?: { method?: string; json?: unknown; headers?: Record<string, string> },
) {
  return page.evaluate(
    async ([url, options]) => {
      const response = await fetch(url, {
        method: options?.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers ?? {}),
        },
        body:
          options?.json === undefined
            ? undefined
            : JSON.stringify(options.json),
      });
      return response.status === 204
        ? null
        : ((await response.json()) as unknown);
    },
    [path, init] as const,
  );
}

async function signIn(page: Page, accountId: string, path: string) {
  await api(page, '/api/session', { method: 'POST', json: { accountId } });
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Publishes the form and submits DEMO-001 Q1 with shared CPC minutes on every milestone. */
async function submitQ1(page: Page) {
  await openApp(page);
  await api(page, '/api/__mock/reset', { method: 'POST' });
  await api(page, '/api/session', {
    method: 'POST',
    json: { accountId: 'administrator' },
  });
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await api(page, '/api/session', {
    method: 'POST',
    json: { accountId: 'focal-demo-001' },
  });
  const obligation = encodeURIComponent('DEMO-001:FY2026-27-Q1');
  const upload = (await page.evaluate(async (o) => {
    const body = new FormData();
    body.append(
      'file',
      new File(
        [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])],
        'cpc-minutes-q1.pdf',
      ),
    );
    body.append('category', 'cpc_minutes');
    return (
      await fetch(`/api/obligations/${o}/evidence`, { method: 'POST', body })
    ).json();
  }, obligation)) as { id: string };
  const bundle = (await api(page, `/api/obligations/${obligation}/report`)) as {
    baseline: { milestones: { id: string }[] };
  };
  const milestones = Object.fromEntries(
    bundle.baseline.milestones.map((m) => [
      m.id,
      {
        completed: true,
        output: 'Done.',
        emergingIssues: '',
        actions: '',
        evidence: [{ evidenceId: upload.id, passage: 'Item 4' }],
        evidenceUnavailable: null,
      },
    ]),
  );
  const answers = {
    questions: {
      'cpc-minutes': { evidenceIds: [upload.id], unavailable: null },
      'iao-minutes': {
        evidenceIds: [],
        unavailable: { explanation: 'IAO minutes are awaiting signature.' },
      },
      'emerging-issues': 'Registry staff turnover.',
      'actions-planned': 'Recruit two officers.',
      remarks: '',
    },
    milestones,
  };
  await api(page, `/api/obligations/${obligation}/draft`, {
    method: 'PUT',
    json: { baseVersion: 0, answers },
  });
  await api(page, `/api/obligations/${obligation}/submit`, {
    method: 'POST',
    headers: { 'Idempotency-Key': 'e2e-q1' },
    json: {
      draftVersion: 1,
      attestation: {
        authorized: true,
        submitterRole: 'IAO',
        approval: { kind: 'reference', reference: 'CPC minutes item 4' },
      },
    },
  });
}

test('clarification, revised submission, re-review and carry-forward (AT09, AT27)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await submitQ1(page);

  // Officer accepts everything, then asks about M-01.
  await signIn(page, 'officer-a', '/officer');
  await page
    .getByRole('table', { name: /Submissions awaiting review/ })
    .getByRole('link', { name: 'DEMO-001' })
    .click();
  await passSuitability(page);
  for (const code of ['M-01', 'M-02', 'M-03', 'M-04']) {
    const card = page.getByRole('article', { name: new RegExp(`^${code} `) });
    await card.getByLabel(/^Accept:/).check();
    await card.getByRole('button', { name: 'Save decision' }).click();
    await expect(card.getByText(/Saved by/)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Request clarification' }).click();
  const clarify = page.getByRole('region', { name: 'Request clarification' });
  await clarify.getByRole('checkbox', { name: /^M-01 / }).check();
  await page
    .getByLabel('Question')
    .fill(
      'The minutes support the register but not the exception review. Where is it recorded?',
    );
  await page
    .getByLabel('Evidence requested (optional)')
    .fill('Exception review record');
  await page.getByRole('button', { name: 'Send 1 question' }).click();
  await expect(page.getByText('Awaiting institution response')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Finalize review' }),
  ).toBeDisabled();

  // Institution sees it in the inbox, adds the exception review record to M-01 only, and resubmits.
  await signIn(page, 'focal-demo-001', '/institution/inbox');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Clarification requested' })
    .getByRole('button', { name: /^Open/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Clarification requests' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Prepare a revised report' }).click();
  await expect(
    page.getByText(/This draft starts from your last submitted revision/),
  ).toBeVisible();
  const cpc = page.locator('#field-questions-cpc-minutes');
  await cpc
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'exception-review.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7 exception review'),
    });
  await expect(cpc.getByText('exception-review.pdf')).toBeVisible();
  const m01 = page.getByRole('article').filter({ hasText: 'M-01' });
  await m01.getByRole('checkbox', { name: /exception-review\.pdf/ }).check();
  await m01
    .getByLabel('Page or section in exception-review.pdf')
    .fill('Page 1');
  await page.getByRole('button', { name: 'Review and submit' }).click();
  await page.getByLabel(/I am authorized to submit/).check();
  await page
    .getByLabel('Your role or delegation reference')
    .fill('Integrity Assurance Officer');
  await page.getByLabel('Approved; I have the reference').check();
  await page.getByLabel('Approval reference').fill('CPC minutes 12 Sep 2026');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(
    page
      .getByText('Revision', { exact: true })
      .locator('xpath=following-sibling::dd[1]'),
  ).toHaveText('2');

  // Officer: M-01 needs a new review; the unchanged milestones carry forward by confirmation.
  await signIn(page, 'officer-a', '/officer');
  const queue = page.getByRole('table', {
    name: /Submissions awaiting review/,
  });
  await expect(queue.getByText('Needs re-review')).toBeVisible();
  await queue.getByRole('link', { name: 'DEMO-001' }).click();
  await expect(
    page.getByText(
      /1 milestone changed and needs a new review since revision 1/,
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: /^M-01 / })
      .getByText('Changed since revision 1: needs a new review.'),
  ).toBeVisible();
  for (const code of ['M-02', 'M-03', 'M-04']) {
    const card = page.getByRole('article', { name: new RegExp(`^${code} `) });
    await card
      .getByRole('button', { name: 'Confirm earlier decision for revision 2' })
      .click();
    await expect(
      card.getByText(/Confirmed from the earlier revision/),
    ).toBeVisible();
  }
  await passSuitability(page);
  const m01Review = page.getByRole('article', { name: /^M-01 / });
  await m01Review.getByLabel(/^Accept:/).check();
  await m01Review.getByRole('button', { name: 'Save decision' }).click();
  await expect(m01Review.getByText(/Saved by/)).toBeVisible();

  // The seeded baseline must be confirmed first (AT25); the page says so before any attempt.
  await expect(
    page.getByRole('button', { name: 'Finalize review' }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Confirm that the seeded Q1 baseline matches/),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Open DEMO-001 baselines' }).click();
  await page
    .getByRole('button', {
      name: 'Confirm correspondence with the approved plan',
    })
    .click();
  await expect(
    page.getByText(/SEEDED HISTORICAL BASELINE · confirmed/).first(),
  ).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Finalize review' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Finalize' })
    .click();
  await expect(
    page.getByText(/Decisions are read-only unless the review is reopened/),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Reopen this review' }),
  ).toBeVisible();
});

test('an inflated baseline cannot be approved without the checks and can be returned (AT31)', async ({
  page,
}) => {
  await openApp(page);
  await api(page, '/api/__mock/reset', { method: 'POST' });
  await signIn(page, 'officer-a', '/officer/institutions/DEMO-004');
  const q2 = page.getByRole('article').filter({ hasText: 'Q2' }).first();
  await expect(
    q2.getByText(
      /12 milestones, of which 2 committee obligations \(17% of the denominator\)/,
    ),
  ).toBeVisible();
  await expect(q2.getByText(/This proposal is large/)).toBeVisible();
  await expect(
    q2.getByRole('button', { name: 'Approve and activate' }),
  ).toBeDisabled();
  await q2
    .getByLabel('Or return it to the institution with feedback')
    .fill(
      'Eight administrative tasks artificially split the plan and dilute the committee obligations.',
    );
  await q2.getByRole('button', { name: 'Return for revision' }).click();
  await expect(q2.getByText('Returned for revision').first()).toBeVisible();
});

test('failed email is visible to the administrator and succeeds on retry (AT12)', async ({
  page,
}) => {
  await openApp(page);
  await api(page, '/api/__mock/reset', { method: 'POST' });
  await api(page, '/api/__mock/email-failure', {
    method: 'POST',
    json: { enabled: true },
  });
  await api(page, '/api/session', {
    method: 'POST',
    json: { accountId: 'administrator' },
  });
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await signIn(page, 'administrator', '/admin/notifications');
  await expect(
    page.getByRole('tab', { name: /Failure queue \(10\)/ }),
  ).toBeVisible();
  await expect(page.getByText('Failed after retries').first()).toBeVisible();
  await api(page, '/api/__mock/email-failure', {
    method: 'POST',
    json: { enabled: false },
  });
  await page.getByRole('button', { name: 'Retry' }).first().click();
  await expect(
    page.getByRole('tab', { name: /Failure queue \(9\)/ }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Demo email sink' }).click();
  await expect(
    page.getByText('Reporting form version 1 published'),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Administration' })
    .getByRole('link', { name: 'Audit log' })
    .click();
  await expect(page.getByText('delivery.retry')).toBeVisible();
});
