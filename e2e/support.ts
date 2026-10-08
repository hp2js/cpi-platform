import { expect, type Page } from '@playwright/test';

/** Loads the app and waits until the mock API worker is serving requests. */
export async function openApp(page: Page) {
  await page.goto('/sign-in?demo=open');
  await expect(
    page.getByRole('heading', { name: 'Prevention officer' }),
  ).toBeVisible();
}

/**
 * Stops the test unless `status` is a success, naming the step, the status and the error code,
 * so a refused setup step fails here instead of on an unrelated locator later.
 */
export function ensureOk(step: string, status: number, body: unknown) {
  if (status >= 200 && status < 300) return;
  const { code, message } = (body ?? {}) as { code?: string; message?: string };
  throw new Error(
    `${step} was refused: ${status} ${code ?? '(no error code)'}${message ? ` — ${message}` : ''}`,
  );
}

/** Calls the API from inside the page, so the service worker handles it; fails on any error. */
export async function api<T = unknown>(
  page: Page,
  path: string,
  init?: { method?: string; json?: unknown; headers?: Record<string, string> },
) {
  const { status, body } = await page.evaluate(
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
      const text = await response.text();
      let body: unknown = text || null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON, e.g. a proxy error page; kept as text for the failure message.
      }
      return { status: response.status, body };
    },
    [path, init] as const,
  );
  ensureOk(`${init?.method ?? 'GET'} ${path}`, status, body);
  return body as T;
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

export async function uploadPdf(
  page: Page,
  obligationId: string,
  name: string,
  category: string,
) {
  return page
    .evaluate(
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
                ...new TextEncoder().encode(`${fileName}\n%%EOF\n`),
              ]),
            ],
            fileName,
          ),
        );
        body.append('category', kind);
        const response = await fetch(
          `/api/obligations/${encodeURIComponent(id)}/evidence`,
          { method: 'POST', body },
        );
        return {
          status: response.status,
          body: (await response.json()) as { id: string },
        };
      },
      [obligationId, name, category] as const,
    )
    .then(({ status, body }) => {
      ensureOk(`Uploading ${name} to ${obligationId}`, status, body);
      return body;
    });
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
  const submission = (institutionId: string) => {
    const item = queue.find((entry) => entry.institutionId === institutionId);
    if (!item)
      throw new Error(
        `Mid-year setup did not reach its state: no open review for ${institutionId}`,
      );
    return item.submissionId;
  };
  const demo2 = submission('DEMO-002');
  await api(page, `/api/reviews/${demo2}/clarifications`, {
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
  return { review: submission('DEMO-001') };
}

const demoInstitutions = Array.from(
  { length: 8 },
  (_, index) => `DEMO-00${index + 1}`,
);

/** Runs the scripted year and publishes every result, then confirms all eight are released. */
export async function publishedYear(page: Page) {
  await reset(page);
  await signInAs(page, 'administrator');
  await api(page, '/api/simulation/scenario', { method: 'POST' });
  const overview = await api<{
    cutoffPassed: boolean;
    institutions: { institutionId: string; publication: unknown }[];
  }>(page, '/api/annual/publish', {
    method: 'POST',
    json: { institutionIds: demoInstitutions },
  });
  const published = overview.institutions.filter((i) => i.publication).length;
  if (!overview.cutoffPassed || published !== demoInstitutions.length)
    throw new Error(
      `Published-year setup did not reach its state: cutoff passed ${overview.cutoffPassed}, ${published} of ${demoInstitutions.length} results published`,
    );
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
