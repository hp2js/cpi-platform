// @vitest-environment node
import {
  draftSchema,
  evidenceItemSchema,
  formVersionSchema,
  receiptSchema,
  reportBundleSchema,
  reviewBundleSchema,
  reviewQueueSchema,
  type ReportAnswers,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { exeBytes, pdfBytes, uploadForm } from '@/test/fixtures';
import { signInAs } from '@/test/render-app';

const OBLIGATION = 'DEMO-001:FY2026-27-Q1';
const obligationPath =
  `/api/obligations/${encodeURIComponent(OBLIGATION)}` as const;

async function publishSeedForm() {
  await signInAs('administrator');
  await request('/api/forms/form-v1/publish', formVersionSchema, {
    method: 'POST',
  });
}

const attestation = {
  authorized: true,
  submitterRole: 'Integrity Assurance Officer',
  approval: { kind: 'reference', reference: 'CPC minutes 12 Sep 2026, item 4' },
};

async function completeDraft() {
  await signInAs('focal-demo-001');
  const upload = await request(
    `${obligationPath}/evidence`,
    evidenceItemSchema,
    {
      method: 'POST',
      body: uploadForm('cpc-minutes.pdf', pdfBytes(), 'cpc_minutes'),
    },
  );
  const bundle = await request(`${obligationPath}/report`, reportBundleSchema);
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
  return request(`${obligationPath}/draft`, draftSchema, {
    method: 'PUT',
    json: { baseVersion: bundle.draft?.version ?? 0, answers },
  });
}

describe('form publication (FR03)', () => {
  it('blocks invalid weights with an actionable error (AT03)', async () => {
    await signInAs('administrator');
    const form = await request('/api/forms/form-v1', formVersionSchema);
    await request('/api/forms/form-v1', formVersionSchema, {
      method: 'PUT',
      json: { ...form, weights: { ...form.weights, implementation: 50 } },
    });
    await expect(
      request('/api/forms/form-v1/publish', z.unknown(), { method: 'POST' }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: {
        weights: 'Indicator weights must total 100; they total 90.',
      },
    });
  });

  it('keeps the report closed until a form is published', async () => {
    await signInAs('focal-demo-001');
    const bundle = await request(
      `${obligationPath}/report`,
      reportBundleSchema,
    );
    expect(bundle.form).toBeNull();
    expect(bundle.editable).toBe(false);
  });
});

describe('institution submission (FR05–FR07)', () => {
  it('rejects a disguised executable (AT21)', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-001');
    await expect(
      request(`${obligationPath}/evidence`, z.unknown(), {
        method: 'POST',
        body: uploadForm('minutes.pdf', exeBytes(), 'cpc_minutes'),
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { file: expect.stringContaining('do not match') },
    });
  });

  it('requires attestation but keeps the draft (AT26)', async () => {
    await publishSeedForm();
    const draft = await completeDraft();
    await expect(
      request(`${obligationPath}/submit`, z.unknown(), {
        method: 'POST',
        headers: { 'Idempotency-Key': 'k1' },
        json: { draftVersion: draft.version },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'attestation_required' });
    const bundle = await request(
      `${obligationPath}/report`,
      reportBundleSchema,
    );
    expect(bundle.draft?.version).toBe(draft.version);
  });

  it('submits once per idempotency key and hides scores from the receipt (AT06, AT07)', async () => {
    await publishSeedForm();
    const draft = await completeDraft();
    const submit = () =>
      request(`${obligationPath}/submit`, receiptSchema, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'same-key' },
        json: { draftVersion: draft.version, attestation },
      });
    const first = await submit();
    const retry = await submit();
    expect(retry.id).toBe(first.id);
    expect(first).toMatchObject({
      revision: 1,
      timeliness: 'on_time',
      calculation: 'recorded',
    });
    expect(first.declaredUnavailable.map((item) => item.label)).toEqual([
      'Signed IAO meeting minutes for the quarter',
    ]);
    expect(JSON.stringify(first)).not.toMatch(/points|fraction|numerator/);
    const bundle = await request(
      `${obligationPath}/report`,
      reportBundleSchema,
    );
    expect(bundle.receipts).toHaveLength(1);
    expect(bundle.obligation.state).toBe('submitted');
    expect(bundle.editable).toBe(false);
  });
});

describe('officer review (FR09–FR10)', () => {
  async function submitted() {
    await publishSeedForm();
    const draft = await completeDraft();
    await request(`${obligationPath}/submit`, receiptSchema, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      json: { draftVersion: draft.version, attestation },
    });
    await signInAs('officer-a');
    const [item] = await request('/api/reviews', reviewQueueSchema);
    return item!;
  }

  it('records decisions and finalizes the latest revision', async () => {
    const item = await submitted();
    const path = `/api/reviews/${item.submissionId}` as const;
    const initial = await request(path, reviewBundleSchema);
    expect(initial.score.provisional).toMatchObject({
      status: 'calculated',
      points: '60.00',
    });
    expect(initial.score.reviewed).toMatchObject({ status: 'pending' });

    await expect(
      request(`${path}/decisions/M-01`, z.unknown(), {
        method: 'PUT',
        json: { outcome: 'rejected', reason: '', revision: 1 },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      request(`${path}/finalize`, z.unknown(), {
        method: 'POST',
        json: { revision: 1 },
      }),
    ).rejects.toMatchObject({ status: 422 });
    await request(`${path}/decisions/M-01`, reviewBundleSchema, {
      method: 'PUT',
      json: {
        outcome: 'rejected',
        reason: 'Minutes do not record the exception review.',
        revision: 1,
      },
    });
    for (const code of ['M-02', 'M-03', 'M-04']) {
      await request(`${path}/decisions/${code}`, reviewBundleSchema, {
        method: 'PUT',
        json: { outcome: 'accepted', reason: '', revision: 1 },
      });
    }
    await expect(
      request(`${path}/decisions/M-02`, z.unknown(), {
        method: 'PUT',
        json: { outcome: 'accepted', reason: '', revision: 2 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    const final = await request(`${path}/finalize`, reviewBundleSchema, {
      method: 'POST',
      json: { revision: 1 },
    });
    expect(final.score.reviewed).toMatchObject({
      status: 'calculated',
      points: '45.00',
    });
    expect(final.item.state).toBe('finalized');
    expect(final.canDecide).toBe(false);
  });

  it('refuses reviewers outside the assignment (AT02)', async () => {
    const item = await submitted();
    await signInAs('officer-b');
    await expect(
      request(`/api/reviews/${item.submissionId}`, z.unknown()),
    ).rejects.toMatchObject({ status: 404 });
    await signInAs('supervisor');
    const read = await request(
      `/api/reviews/${item.submissionId}`,
      reviewBundleSchema,
    );
    expect(read.canDecide).toBe(false);
    await expect(
      request(`/api/reviews/${item.submissionId}/decisions/M-01`, z.unknown(), {
        method: 'PUT',
        json: { outcome: 'accepted', reason: '', revision: 1 },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
