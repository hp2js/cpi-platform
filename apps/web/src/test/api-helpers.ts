import {
  draftSchema,
  evidenceItemSchema,
  formVersionSchema,
  planSchema,
  receiptSchema,
  reportBundleSchema,
  reviewBundleSchema,
  reviewQueueSchema,
  sessionSchema,
  signInChallengeSchema,
  suitabilityCheckKeys,
  type ReportAnswers,
} from '@cpi/contracts';
import { z } from 'zod';
import { request } from '@/lib/api';
import { getDb } from '@/mocks/db';
import { pdfBytes, uploadForm } from './fixtures';
import { signInAs } from './render-app';

/** Shared mock-API steps for tests that need a report in a given state. */
export const obligationPath = (institutionId: string, quarter = 1) =>
  `/api/obligations/${encodeURIComponent(`${institutionId}:FY2026-27-Q${quarter}`)}` as const;

export const attestation = {
  authorized: true as const,
  submitterRole: 'Integrity Assurance Officer',
  approval: {
    kind: 'reference' as const,
    reference: 'CPC minutes 12 Sep 2026, item 4',
  },
};

export async function publishSeedForm() {
  await signInAs('administrator');
  await request('/api/forms/form-v1/publish', formVersionSchema, {
    method: 'POST',
  });
}

/** Uploads minutes, claims every milestone with them, and saves the draft. */
export async function completeDraft(
  institutionId: string,
  fileSuffix = '',
  bytes = pdfBytes(),
) {
  const path = obligationPath(institutionId);
  const upload = await request(`${path}/evidence`, evidenceItemSchema, {
    method: 'POST',
    body: uploadForm(`cpc-minutes${fileSuffix}.pdf`, bytes, 'cpc_minutes'),
  });
  const bundle = await request(`${path}/report`, reportBundleSchema);
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
  const draft = await request(`${path}/draft`, draftSchema, {
    method: 'PUT',
    json: { baseVersion: bundle.draft?.version ?? 0, answers },
  });
  return { draft, upload, answers };
}

export async function submitDraft(institutionId: string, draftVersion: number) {
  return request(`${obligationPath(institutionId)}/submit`, receiptSchema, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    json: { draftVersion, attestation },
  });
}

/** Publishes the form, submits DEMO-001 Q1 as its focal person, and returns the officer's queue item. */
export async function submittedQ1(
  institutionId = 'DEMO-001',
  officer = 'officer-a',
) {
  await publishSeedForm();
  await signInAs(`focal-${institutionId.toLowerCase()}`);
  const { draft } = await completeDraft(institutionId);
  await submitDraft(institutionId, draft.version);
  await signInAs(officer);
  const queue = await request('/api/reviews', reviewQueueSchema);
  return queue.find((item) => item.institutionId === institutionId)!;
}

/** Confirms the seeded historical Q1 baseline as the assigned officer (AT25). */
export async function confirmSeed(institutionId: string) {
  const plan = await request(
    `/api/institutions/${institutionId}/plan`,
    planSchema,
  );
  const q1 = plan.baselines.find(
    (baseline) => baseline.periodId === 'FY2026-27-Q1',
  )!;
  await request(
    `/api/baselines/${q1.id}/confirm-seed`,
    planSchema.shape.baselines.element,
    { method: 'POST', json: { version: q1.version } },
  );
}

/** The assigned officer records that every file in the review passes its suitability checks (AT30). */
export async function passSuitability(submissionId: string) {
  const bundle = await request(
    `/api/reviews/${submissionId}`,
    reviewBundleSchema,
  );
  const checks = Object.fromEntries(
    suitabilityCheckKeys.map((key) => [key, { outcome: 'pass', reason: '' }]),
  );
  for (const item of bundle.evidence)
    await request(
      `/api/reviews/${submissionId}/evidence/${item.id}/suitability`,
      reviewBundleSchema,
      { method: 'PUT', json: { revision: bundle.item.revision, checks } },
    );
}

/** The newest match of `pattern` in the emails sent to an address (the demo email sink). */
function emailed(email: string, pattern: RegExp, what: string) {
  const found = getDb()
    .emailSink.filter((mail) => mail.to === email.toLowerCase())
    .map((mail) => pattern.exec(mail.body)?.[1])
    .filter(Boolean)
    .at(-1);
  if (!found) throw new Error(`No ${what} was emailed to ${email}`);
  return found;
}

/** The single-use reset link most recently emailed to an address. */
export const emailedLink = (email: string) =>
  emailed(email, /set-password\?token=([\w-]+)/, 'link');
export const emailedPassword = (email: string) =>
  emailed(email, /Temporary password: (\S+)/, 'temporary password');
export const emailedCode = (email: string) =>
  emailed(email, /Your sign-in code is (\d{6})/, 'sign-in code');

/** Password sign-in, confirming the emailed code. */
export async function passwordSignIn(email: string, password: string) {
  const { challengeId } = await request('/api/session', signInChallengeSchema, {
    method: 'POST',
    json: { email, password },
  });
  return request('/api/session/code', sessionSchema, {
    method: 'POST',
    json: { challengeId, code: emailedCode(email) },
  });
}

/**
 * Accepts an emailed invitation: signs in with the temporary password and chooses the
 * person's own, leaving them signed in.
 */
export async function acceptInvitation(
  email: string,
  password = 'a-long-demo-passphrase',
) {
  await passwordSignIn(email, emailedPassword(email));
  await request('/api/account/password', z.undefined(), {
    method: 'POST',
    json: { newPassword: password },
  });
}
