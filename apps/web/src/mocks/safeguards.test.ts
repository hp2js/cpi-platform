// @vitest-environment node
import {
  auditEventsSchema,
  deliveriesSchema,
  draftSchema,
  evidenceItemSchema,
  foundationsSchema,
  inboxSchema,
  planSchema,
  reportBundleSchema,
  reviewBundleSchema,
  reviewQueueSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiUrl, request } from '@/lib/api';
import {
  completeDraft,
  confirmSeed,
  obligationPath,
  publishSeedForm,
  submitDraft,
  submittedQ1,
} from '@/test/api-helpers';
import { pdfBytes, uploadForm } from '@/test/fixtures';
import { signInAs } from '@/test/render-app';
import { responseDueAt } from './services/clarifications';

const path = obligationPath('DEMO-001');
const review = (id: string) => `/api/reviews/${id}` as const;
const clarify = (submissionId: string, revision = 1) =>
  request(`${review(submissionId)}/clarifications`, reviewBundleSchema, {
    method: 'POST',
    json: {
      revision,
      items: [
        {
          milestoneCode: 'M-01',
          question:
            'The minutes do not show the exception review. Where is it recorded?',
          requestedEvidence: 'Exception review record',
        },
      ],
    },
  });

describe('clarification window (PRD §7.3, AT29)', () => {
  it('ends at 23:59:59 EAT on the seventh calendar day after the later event', () => {
    expect(
      responseDueAt('2026-10-02T09:30:00+03:00', '2026-10-02T09:30:00+03:00'),
    ).toBe('2026-10-09T23:59:59+03:00');
    // A notification after local midnight moves the window to the next local date.
    expect(responseDueAt('2026-10-02T20:00:00Z', '2026-10-02T21:30:00Z')).toBe(
      '2026-10-10T23:59:59+03:00',
    );
  });
});

describe('clarification and revision loop (AT09, AT27)', () => {
  it('keeps the earlier receipt, re-reviews changed milestones and carries forward only by confirmation', async () => {
    const item = await submittedQ1();
    for (const code of ['M-01', 'M-02', 'M-03', 'M-04']) {
      await request(
        `${review(item.submissionId)}/decisions/${code}`,
        reviewBundleSchema,
        {
          method: 'PUT',
          json: { outcome: 'accepted', reason: '', revision: 1 },
        },
      );
    }
    const asked = await clarify(item.submissionId);
    expect(asked.clarifications[0]).toMatchObject({
      status: 'open',
      responseDueAt: '2026-10-08T23:59:59+03:00',
      extensionRequired: false,
    });
    expect(asked.item.state).toBe('clarification_requested');

    // Institution revises only M-01 by adding a new file; the rest is unchanged.
    await signInAs('focal-demo-001');
    const bundle = await request(`${path}/report`, reportBundleSchema);
    expect(bundle.editable).toBe(true);
    expect(bundle.clarifications[0]?.items[0]?.criterion).toMatch(/^M-01/);
    const extra = await request(`${path}/evidence`, evidenceItemSchema, {
      method: 'POST',
      body: uploadForm(
        'exception-review.pdf',
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]),
        'other',
      ),
    });
    const answers = structuredClone(bundle.draft!.answers);
    answers.milestones['DEMO-001:M-01']!.evidence.push({
      evidenceId: extra.id,
      passage: 'Page 1',
    });
    const draft = await request(`${path}/draft`, draftSchema, {
      method: 'PUT',
      json: { baseVersion: bundle.draft!.version, answers },
    });
    const receipt = await submitDraft('DEMO-001', draft.version);
    expect(receipt.revision).toBe(2);
    const after = await request(`${path}/report`, reportBundleSchema);
    expect(after.receipts.map((r) => r.revision)).toEqual([1, 2]);
    expect(after.clarifications[0]).toMatchObject({
      status: 'responded',
      response: { revision: 2 },
    });

    await signInAs('officer-a');
    const [current] = await request('/api/reviews', reviewQueueSchema);
    expect(current).toMatchObject({
      revision: 2,
      state: 'submitted',
      decisionsRecorded: 0,
    });
    expect(current!.flags).toContain('needs_re_review');
    const revised = await request(
      review(current!.submissionId),
      reviewBundleSchema,
    );
    expect(revised.prior?.changes).toEqual({
      'DEMO-001:M-01': 'changed',
      'DEMO-001:M-02': 'unchanged',
      'DEMO-001:M-03': 'unchanged',
      'DEMO-001:M-04': 'unchanged',
    });

    // Obsolete revision cannot be finalized or decided (AT10).
    await expect(
      request(`${review(item.submissionId)}/finalize`, z.unknown(), {
        method: 'POST',
        json: { revision: 1 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    // A changed milestone cannot be carried forward; an unchanged one can, explicitly.
    await expect(
      request(
        `${review(current!.submissionId)}/decisions/M-01/carry-forward`,
        z.unknown(),
        { method: 'POST', json: { revision: 2 } },
      ),
    ).rejects.toMatchObject({ status: 409, code: 'dependency_changed' });
    const carried = await request(
      `${review(current!.submissionId)}/decisions/M-02/carry-forward`,
      reviewBundleSchema,
      { method: 'POST', json: { revision: 2 } },
    );
    const m02 = carried.decisions.find(
      (decision) => decision.milestoneId === 'DEMO-001:M-02',
    );
    expect(m02?.carriedForwardFrom).toBe(
      revised.prior?.decisions.find(
        (decision) => decision.milestoneId === 'DEMO-001:M-02',
      )?.id,
    );
    // Historical decisions for revision 1 remain intact.
    expect(
      carried.history.filter((decision) => decision.revision === 1),
    ).toHaveLength(4);
  });
});

describe('controlled reopen (PRD §7.4)', () => {
  it('reopens a finalized review with a reason and keeps decision history', async () => {
    const item = await submittedQ1();
    for (const code of ['M-01', 'M-02', 'M-03', 'M-04']) {
      await request(
        `${review(item.submissionId)}/decisions/${code}`,
        reviewBundleSchema,
        {
          method: 'PUT',
          json: { outcome: 'accepted', reason: '', revision: 1 },
        },
      );
    }
    await confirmSeed('DEMO-001');
    await request(`${review(item.submissionId)}/finalize`, reviewBundleSchema, {
      method: 'POST',
      json: { revision: 1 },
    });
    await expect(
      request(`${review(item.submissionId)}/reopen`, z.unknown(), {
        method: 'POST',
        json: { reason: 'short' },
      }),
    ).rejects.toMatchObject({ status: 422 });
    const reopened = await request(
      `${review(item.submissionId)}/reopen`,
      reviewBundleSchema,
      {
        method: 'POST',
        json: { reason: 'Later evidence suggests M-01 was not completed.' },
      },
    );
    expect(reopened).toMatchObject({
      finalizedAt: null,
      canDecide: true,
      item: { state: 'under_review' },
    });
    await request(
      `${review(item.submissionId)}/decisions/M-01`,
      reviewBundleSchema,
      {
        method: 'PUT',
        json: {
          outcome: 'rejected',
          reason: 'Exception review not evidenced.',
          revision: 1,
        },
      },
    );
    const final = await request(review(item.submissionId), reviewBundleSchema);
    expect(
      final.history.filter(
        (decision) => decision.milestoneId === 'DEMO-001:M-01',
      ),
    ).toHaveLength(2);
    expect(final.score.reviewed).toMatchObject({ points: '45.00' });
  });
});

describe('evidence uploads (FR06)', () => {
  it('returns the completed record on retry and versions a replacement', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-001');
    const upload = () =>
      request(`${path}/evidence`, evidenceItemSchema, {
        method: 'POST',
        body: uploadForm('minutes.pdf', pdfBytes(), 'cpc_minutes'),
      });
    const first = await upload();
    const retry = await upload();
    expect(retry.id).toBe(first.id);
    const body = uploadForm(
      'minutes-signed.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x39]),
      'cpc_minutes',
    );
    body.append('replaces', first.id);
    const replacement = await request(`${path}/evidence`, evidenceItemSchema, {
      method: 'POST',
      body,
    });
    expect(replacement).toMatchObject({ version: 2, predecessorId: first.id });
    expect(replacement.sha256).not.toBe(first.sha256);
    const bundle = await request(`${path}/report`, reportBundleSchema);
    expect(
      bundle.evidence.find((item) => item.id === first.id)?.supersededBy,
    ).toBe(replacement.id);
  });
});

describe('notifications (FR11, AT12)', () => {
  it('routes events to authorized recipients and surfaces failed email for retry', async () => {
    await fetch(apiUrl('/api/__mock/email-failure'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    const item = await submittedQ1();
    expect(item.revision).toBe(1);
    const officerInbox = await request('/api/notifications', inboxSchema);
    expect(
      officerInbox.items.map((notification) => notification.eventType),
    ).toContain('submission.received');
    await signInAs('officer-b');
    const other = await request('/api/notifications', inboxSchema);
    expect(
      other.items.map((notification) => notification.eventType),
    ).not.toContain('submission.received');

    await signInAs('administrator');
    const failed = await request(
      '/api/admin/deliveries?status=failed',
      deliveriesSchema,
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]).toMatchObject({ attempts: 3, status: 'failed' });
    await fetch(apiUrl('/api/__mock/email-failure'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    await request(
      `/api/admin/deliveries/${failed[0]!.id}/retry`,
      z.object({ status: z.string() }),
      { method: 'POST' },
    );
    const all = await request('/api/admin/deliveries', deliveriesSchema);
    expect(all.find((delivery) => delivery.id === failed[0]!.id)?.status).toBe(
      'delivered',
    );
    // The submission itself was never undone by email failure (FR07).
    expect(
      await request('/api/admin/email-sink', z.array(z.unknown())),
    ).toHaveLength(1);
    const events = await request('/api/audit', auditEventsSchema);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'form.publish',
        'evidence.upload',
        'submission.submit',
        'delivery.retry',
      ]),
    );
  });
});

describe('baselines (FR04, AT25, AT31, AT17)', () => {
  const q2 = (plan: z.infer<typeof planSchema>) =>
    plan.baselines
      .filter((baseline) => baseline.periodId === 'FY2026-27-Q2')
      .at(-1)!;
  const checks = {
    materialCoverage: true,
    objectiveConditions: true,
    mandatoryObligations: true,
    noFragmentation: true,
  };

  it('requires every check and a rationale, and lets the officer return an inflated proposal', async () => {
    await signInAs('officer-a');
    const plan = await request('/api/institutions/DEMO-004/plan', planSchema);
    const inflated = q2(plan);
    expect(inflated.milestones).toHaveLength(12);
    await expect(
      request(`/api/baselines/${inflated.id}/approve`, z.unknown(), {
        method: 'POST',
        json: { version: 1, rationale: 'ok', checks },
      }),
    ).rejects.toMatchObject({ status: 422 });
    const returned = await request(
      `/api/baselines/${inflated.id}/return`,
      planSchema.shape.baselines.element,
      {
        method: 'POST',
        json: {
          version: 1,
          reason:
            'Eight administrative tasks artificially split the plan and dilute committee obligations.',
        },
      },
    );
    expect(returned.status).toBe('returned');
    await signInAs('officer-b');
    await expect(
      request(`/api/baselines/${inflated.id}/approve`, z.unknown(), {
        method: 'POST',
        json: { version: 1, rationale: 'x'.repeat(30), checks },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('versions confirmed amendments for unopened periods and refuses opened ones', async () => {
    await signInAs('focal-demo-006');
    const plan = await request('/api/institutions/DEMO-006/plan', planSchema);
    const q1 = plan.baselines.find(
      (baseline) => baseline.periodId === 'FY2026-27-Q1',
    )!;
    await expect(
      request('/api/institutions/DEMO-006/amendments', z.unknown(), {
        method: 'POST',
        json: {
          periodId: q1.periodId,
          milestoneId: q1.milestones[1]!.id,
          change: 'remove',
          toPeriodId: null,
          reason: 'Training moved to next year.',
        },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'baseline_locked' });
    const target = q2(plan);
    await expect(
      request('/api/institutions/DEMO-006/amendments', z.unknown(), {
        method: 'POST',
        json: {
          periodId: target.periodId,
          milestoneId: target.milestones.find((m) => m.mandatory)!.id,
          change: 'remove',
          toPeriodId: null,
          reason: 'We will skip this meeting.',
        },
      }),
    ).rejects.toMatchObject({ status: 422, code: 'mandatory_milestone' });
    const amendment = await request(
      '/api/institutions/DEMO-006/amendments',
      z.object({ id: z.string() }),
      {
        method: 'POST',
        json: {
          periodId: target.periodId,
          milestoneId: target.milestones[1]!.id,
          change: 'reschedule',
          toPeriodId: 'FY2026-27-Q3',
          reason: 'Spot-check team is only available in Q3.',
        },
      },
    );
    await signInAs('officer-b');
    const after = await request(
      `/api/amendments/${amendment.id}/decision`,
      planSchema,
      {
        method: 'POST',
        json: {
          decision: 'confirmed',
          reason: 'Reasonable resourcing constraint; denominator preserved.',
        },
      },
    );
    const q2Versions = after.baselines.filter(
      (baseline) => baseline.periodId === 'FY2026-27-Q2',
    );
    const q3Versions = after.baselines.filter(
      (baseline) => baseline.periodId === 'FY2026-27-Q3',
    );
    expect(q2Versions.map((baseline) => baseline.milestones.length)).toEqual([
      4, 3,
    ]);
    expect(q3Versions.at(-1)?.milestones).toHaveLength(5);
  });
});

describe('foundations (PRD §10.3, AT28)', () => {
  it('scores claimed checks provisionally, reviewed checks after review, and drops credit on supersession', async () => {
    await signInAs('officer-b');
    const initial = await request(
      '/api/institutions/DEMO-005/foundations',
      foundationsSchema,
    );
    const risk = initial.indicators.find(
      (indicator) => indicator.kind === 'risk_assessment',
    )!;
    expect(risk.provisional).toMatchObject({ points: '11.25' });
    expect(risk.reviewed).toMatchObject({ status: 'pending' });
    const pass = { outcome: 'pass' as const, passage: 'Section 2', reason: '' };
    await expect(
      request(
        '/api/institutions/DEMO-005/foundations/risk_assessment/review',
        z.unknown(),
        {
          method: 'PUT',
          json: {
            versionId: risk.versions[0]!.id,
            checks: [
              pass,
              pass,
              { outcome: 'fail', passage: '', reason: '' },
              pass,
            ],
          },
        },
      ),
    ).rejects.toMatchObject({ status: 422 });
    const reviewed = await request(
      '/api/institutions/DEMO-005/foundations/risk_assessment/review',
      foundationsSchema,
      {
        method: 'PUT',
        json: {
          versionId: risk.versions[0]!.id,
          checks: [
            pass,
            pass,
            {
              outcome: 'fail',
              passage: '',
              reason: 'No probability or impact scores are given.',
            },
            pass,
          ],
        },
      },
    );
    expect(
      reviewed.indicators.find(
        (indicator) => indicator.kind === 'risk_assessment',
      )!.reviewed,
    ).toMatchObject({ points: '11.25' });

    await signInAs('focal-demo-005');
    const own = await request(
      '/api/institutions/DEMO-005/foundations',
      foundationsSchema,
    );
    expect(
      own.indicators.every(
        (indicator) =>
          indicator.provisional === null && indicator.reviewed === null,
      ),
    ).toBe(true);
    const body = uploadForm(
      'risk-assessment-v2.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x33]),
      'risk_assessment',
    );
    body.append('kind', 'risk_assessment');
    body.append('approvalReference', 'CPC resolution 2 Oct 2026');
    body.append('effectiveFrom', '2026-10-02');
    body.append('claimedChecks', JSON.stringify([true, true, true, true]));
    await request('/api/institutions/DEMO-005/foundations', foundationsSchema, {
      method: 'POST',
      body,
    });

    await signInAs('officer-b');
    const after = await request(
      '/api/institutions/DEMO-005/foundations',
      foundationsSchema,
    );
    const updated = after.indicators.find(
      (indicator) => indicator.kind === 'risk_assessment',
    )!;
    expect(updated.versions.map((version) => version.status)).toEqual([
      'active',
      'superseded',
    ]);
    expect(updated.reviewed).toMatchObject({ status: 'pending' });
  });
});

describe('prior phase regressions', () => {
  it('still submits a first revision without clarifications', async () => {
    await publishSeedForm();
    await signInAs('focal-demo-002');
    const { draft } = await completeDraft('DEMO-002');
    const receipt = await submitDraft('DEMO-002', draft.version);
    expect(receipt.revision).toBe(1);
  });
});
