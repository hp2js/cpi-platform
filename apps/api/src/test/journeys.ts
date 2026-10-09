import type {
  Draft,
  EvidenceItem,
  Receipt,
  ReportAnswers,
  ReportBundle,
  ReviewBundle,
} from '@cpi/contracts';
import type { Client } from './api';

/** Shared API steps for tests that need a report in a given state (as apps/web/src/test/api-helpers.ts). */
export const obligationPath = (institutionId: string, quarter = 1) =>
  `/obligations/${encodeURIComponent(`${institutionId}:FY2026-27-Q${quarter}`)}`;

export const attestation = {
  authorized: true as const,
  submitterRole: 'Integrity Assurance Officer',
  approval: {
    kind: 'reference' as const,
    reference: 'CPC minutes 12 Sep 2026, item 4',
  },
};

/** A minimal file with a real PDF signature. */
export const pdf = (text = 'minutes') =>
  new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);

export async function publishSeedForm(admin: Client) {
  const result = await admin.post('/forms/form-v1/publish');
  if (result.status !== 200)
    throw new Error(`Publish failed: ${result.status}`);
}

/** Uploads minutes, claims every milestone with them, and saves the draft. */
export async function completeDraft(
  focal: Client,
  institutionId: string,
  fileText = 'minutes',
  bytes = pdf(fileText),
) {
  const path = obligationPath(institutionId);
  const upload = (
    await focal.upload(
      `${path}/evidence`,
      { name: 'cpc-minutes.pdf', bytes },
      { category: 'cpc_minutes' },
    )
  ).body as EvidenceItem;
  const bundle = await focal.json<ReportBundle>(`${path}/report`);
  const answers: ReportAnswers = {
    questions: {
      'cpc-minutes': { evidenceIds: [upload.id], unavailable: null },
      'iao-minutes': {
        evidenceIds: [],
        unavailable: { explanation: 'IAO minutes are awaiting signature.' },
      },
      'emerging-issues': 'Staff turnover in the registry.',
      'actions-planned': 'Recruit two registry officers.',
      remarks: '',
    },
    milestones: Object.fromEntries(
      bundle.baseline.milestones.map((milestone) => [
        milestone.id,
        {
          completed: true,
          output: 'Completed as planned.',
          emergingIssues: '',
          actions: '',
          evidence: [{ evidenceId: upload.id, passage: 'Item 4, page 2' }],
          evidenceUnavailable: null,
        },
      ]),
    ),
  };
  const draft = (
    await focal.put(`${path}/draft`, {
      baseVersion: bundle.draft?.version ?? 0,
      answers,
    })
  ).body as Draft;
  return { draft, upload, answers };
}

export async function submitDraft(
  focal: Client,
  institutionId: string,
  draftVersion: number,
  key = `submit-${institutionId}-${draftVersion}`,
) {
  const result = await focal.post(
    `${obligationPath(institutionId)}/submit`,
    { draftVersion, attestation },
    { 'Idempotency-Key': key },
  );
  if (result.status >= 400)
    throw new Error(`Submit failed: ${JSON.stringify(result.body)}`);
  return result.body as Receipt;
}

const checks = Object.fromEntries(
  ['institution', 'period', 'relevance', 'approval', 'readability'].map(
    (key) => [key, { outcome: 'pass', reason: '' }],
  ),
);

/** The assigned officer records that every file in the review passes its suitability checks (AT30). */
export async function passSuitability(officer: Client, submissionId: string) {
  const bundle = await officer.json<ReviewBundle>(`/reviews/${submissionId}`);
  for (const item of bundle.evidence)
    await officer.put(
      `/reviews/${submissionId}/evidence/${item.id}/suitability`,
      { revision: bundle.item.revision, checks },
    );
}

export async function decideAll(
  officer: Client,
  submissionId: string,
  revision: number,
  codes = ['M-01', 'M-02', 'M-03', 'M-04'],
) {
  for (const code of codes) {
    const result = await officer.put(
      `/reviews/${submissionId}/decisions/${code}`,
      { outcome: 'accepted', reason: '', revision },
    );
    if (result.status !== 200)
      throw new Error(`Decision ${code}: ${JSON.stringify(result.body)}`);
  }
}

/** The latest single-use link token emailed to an address (demo email sink). */
export async function emailedToken(admin: Client, email: string) {
  const mails =
    await admin.json<{ to: string; body: string }[]>('/admin/email-sink');
  // The newest message to that address that carries a link (not later notices).
  const token = mails
    .filter((candidate) => candidate.to === email)
    .map((candidate) => candidate.body.match(/token=([\w-]+)/)?.[1])
    .find(Boolean);
  if (!token) throw new Error(`No link emailed to ${email}`);
  return token;
}

export const STRONG_PASSWORD = 'correct horse battery staple';

/** The newest match of `pattern` in the email sink for that address. */
async function emailed(admin: Client, email: string, pattern: RegExp) {
  const mails =
    await admin.json<{ to: string; body: string }[]>('/admin/email-sink');
  const found = mails
    .filter((candidate) => candidate.to === email.toLowerCase())
    .map((candidate) => candidate.body.match(pattern)?.[1])
    .find(Boolean);
  if (!found)
    throw new Error(`Nothing matching ${pattern} emailed to ${email}`);
  return found;
}
export const emailedPassword = (admin: Client, email: string) =>
  emailed(admin, email, /Temporary password: (\S+)/);
export const emailedCode = (admin: Client, email: string) =>
  emailed(admin, email, /Your sign-in code is (\d{6})/);

/** Password sign-in through the emailed code; returns the final response. */
export async function passwordSignIn(
  client: Client,
  admin: Client,
  email: string,
  password: string,
) {
  const first = await client.post('/session', { email, password });
  if (first.status !== 202) return first;
  const { challengeId } = first.body as { challengeId: string };
  return client.post('/session/code', {
    challengeId,
    code: await emailedCode(admin, email),
  });
}

/** An invited person signs in with the emailed temporary password and chooses their own. */
export async function activateInvited(
  admin: Client,
  client: Client,
  email: string,
  password = STRONG_PASSWORD,
) {
  const signedIn = await passwordSignIn(
    client,
    admin,
    email,
    await emailedPassword(admin, email),
  );
  if (signedIn.status !== 200)
    throw new Error(`Sign-in failed: ${signedIn.status}`);
  const changed = await client.post('/account/password', {
    newPassword: password,
  });
  if (changed.status !== 204)
    throw new Error(`Password change failed: ${changed.status}`);
  return client;
}
