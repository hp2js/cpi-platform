import { expect, type Page } from '@playwright/test';

/** Loads the app and waits until the mock API worker is serving requests. */
export async function openApp(page: Page) {
  await page.goto('/sign-in?demo=open');
  await expect(
    page.getByRole('heading', { name: 'Prevention officer' }),
  ).toBeVisible();
}

/** Calls the mock API from inside the page, so the service worker handles it. */
export async function api<T = unknown>(
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
      return (
        response.status === 204 ? null : await response.json()
      ) as unknown;
    },
    [path, init] as const,
  ) as Promise<T>;
}

export async function signInAs(page: Page, accountId: string) {
  await api(page, '/api/session', { method: 'POST', json: { accountId } });
}

/** Switches account and opens a page, waiting for its main heading. */
export async function visit(page: Page, accountId: string, path: string) {
  await signInAs(page, accountId);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function reset(page: Page) {
  await openApp(page);
  await api(page, '/api/__mock/reset', { method: 'POST' });
}

async function uploadPdf(
  page: Page,
  obligationId: string,
  name: string,
  category: string,
) {
  return page.evaluate(
    async ([id, fileName, kind]) => {
      const body = new FormData();
      body.append(
        'file',
        new File(
          [
            new Uint8Array([
              0x25,
              0x50,
              0x44,
              0x46,
              0x2d,
              ...new TextEncoder().encode(fileName),
            ]),
          ],
          fileName,
        ),
      );
      body.append('category', kind);
      return (
        await fetch(`/api/obligations/${encodeURIComponent(id)}/evidence`, {
          method: 'POST',
          body,
        })
      ).json() as Promise<{ id: string }>;
    },
    [obligationId, name, category] as const,
  );
}

/** Submits a complete Q1 report for an institution through the mock API. */
export async function submitQ1(page: Page, institutionId: string) {
  const obligation = `${institutionId}:FY2026-27-Q1`;
  await signInAs(page, `focal-${institutionId.toLowerCase()}`);
  const minutes = await uploadPdf(
    page,
    obligation,
    `cpc-minutes-${institutionId}.pdf`,
    'cpc_minutes',
  );
  const bundle = await api<{ baseline: { milestones: { id: string }[] } }>(
    page,
    `/api/obligations/${encodeURIComponent(obligation)}/report`,
  );
  const answers = {
    questions: {
      'cpc-minutes': { evidenceIds: [minutes.id], unavailable: null },
      'iao-minutes': {
        evidenceIds: [],
        unavailable: { explanation: 'IAO minutes are awaiting signature.' },
      },
      'emerging-issues': 'Staff turnover.',
      'actions-planned': 'Recruit two officers.',
      remarks: '',
    },
    milestones: Object.fromEntries(
      bundle.baseline.milestones.map((milestone) => [
        milestone.id,
        {
          completed: true,
          output: 'Done.',
          emergingIssues: '',
          actions: '',
          evidence: [{ evidenceId: minutes.id, passage: 'Item 4' }],
          evidenceUnavailable: null,
        },
      ]),
    ),
  };
  await api(page, `/api/obligations/${encodeURIComponent(obligation)}/draft`, {
    method: 'PUT',
    json: { baseVersion: 0, answers },
  });
  await api(page, `/api/obligations/${encodeURIComponent(obligation)}/submit`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `${institutionId}-q1` },
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

/**
 * Mid-year state with open work of every kind: published form, a draft form version, a
 * submission awaiting review, and an open clarification.
 */
export async function midYear(page: Page) {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/forms/form-v1/publish', { method: 'POST' });
  await api(page, '/api/forms', { method: 'POST' });
  await submitQ1(page, 'DEMO-001');
  await submitQ1(page, 'DEMO-002');
  await signInAs(page, 'officer-a');
  const queue = await api<{ submissionId: string; institutionId: string }[]>(
    page,
    '/api/reviews?status=open',
  );
  const demo2 = queue.find((item) => item.institutionId === 'DEMO-002')!;
  await api(page, `/api/reviews/${demo2.submissionId}/clarifications`, {
    method: 'POST',
    json: {
      revision: 1,
      items: [
        {
          milestoneCode: 'M-01',
          question: 'Where is the exception review recorded in the minutes?',
          requestedEvidence: 'Exception review record',
        },
      ],
    },
  });
  return {
    review: queue.find((item) => item.institutionId === 'DEMO-001')!
      .submissionId,
  };
}

/** Runs the scripted year and publishes every result. */
export async function publishedYear(page: Page) {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/simulation/scenario', { method: 'POST' });
  await api(page, '/api/annual/publish', {
    method: 'POST',
    json: {
      institutionIds: [
        'DEMO-001',
        'DEMO-002',
        'DEMO-003',
        'DEMO-004',
        'DEMO-005',
        'DEMO-006',
        'DEMO-007',
        'DEMO-008',
      ],
    },
  });
}

/** The officer records that every unchecked file passes its suitability checks (AT30). */
export async function passSuitability(page: Page) {
  const section = page.getByRole('region', { name: 'Evidence suitability' });
  await expect(section).toBeVisible();
  const shortcut = section.getByRole('button', {
    name: /^All five checks pass/,
  });
  while ((await shortcut.count()) > 0) {
    const before = await shortcut.count();
    await shortcut.first().click();
    await expect(shortcut).toHaveCount(before - 1);
  }
}
