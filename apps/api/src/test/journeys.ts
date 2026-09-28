import type {
  Draft,
  EvidenceItem,
  Receipt,
  ReportAnswers,
  ReportBundle,
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
) {
  const path = obligationPath(institutionId);
  const upload = (
    await focal.upload(
      `${path}/evidence`,
      { name: 'cpc-minutes.pdf', bytes: pdf(fileText) },
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
