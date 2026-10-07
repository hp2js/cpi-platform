// @vitest-environment node
import {
  annualOverviewSchema,
  evidenceLookupSchema,
  auditPageSchema,
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
import { apiUrl, request, requestFile } from '@/lib/api';
import {
  completeDraft,
  confirmSeed,
  obligationPath,
  passSuitability,
  publishSeedForm,
  submitDraft,
  submittedQ1,
} from '@/test/api-helpers';
import { pdfBytes, uploadForm } from '@/test/fixtures';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';
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
    await passSuitability(item.submissionId);
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
      body: uploadForm('exception-review.pdf', pdfBytes('2'), 'other'),
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
    await passSuitability(item.submissionId);
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
    const body = uploadForm('minutes-signed.pdf', pdfBytes('9'), 'cpc_minutes');
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
    const { events } = await request('/api/audit', auditPageSchema);
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
          failedChecks: ['noFragmentation'],
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
    const amend = (milestoneId: string) =>
      request('/api/institutions/DEMO-006/amendments', z.unknown(), {
        method: 'POST',
        json: {
          periodId: target.periodId,
          milestoneId,
          change: 'remove',
          toPeriodId: null,
          reason: 'We will not need this milestone.',
        },
      });
    // A proposed baseline is changed through the plan, not amended.
    await expect(amend(target.milestones[0]!.id)).rejects.toMatchObject({
      status: 409,
      code: 'baseline_not_approved',
    });
    await signInAs('officer-b');
    await request(`/api/baselines/${target.id}/approve`, z.unknown(), {
      method: 'POST',
      json: {
        version: target.version,
        rationale: 'Covers the material risks with objective conditions.',
        checks,
      },
    });
    await signInAs('focal-demo-006');
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
    // The plan follows the confirmed amendment, so a later proposal keeps the move.
    expect(
      after.plannedMilestones.find(
        (milestone) => milestone.id === target.milestones[1]!.id,
      )?.periodId,
    ).toBe('FY2026-27-Q3');
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
      pdfBytes('3'),
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

describe('foundation disposition at the cutoff (PRD §10.3, AT28)', () => {
  it('scores the version effective at the cutoff, and a withdrawn one only through an explicit unsupported disposition', async () => {
    const pass = { outcome: 'pass' as const, passage: 'Section 1', reason: '' };
    const path = '/api/institutions/DEMO-008/foundations';
    const indicator = (
      foundations: z.infer<typeof foundationsSchema>,
      kind: string,
    ) => foundations.indicators.find((candidate) => candidate.kind === kind)!;
    await signInAs('officer-b');
    const before = await request(path, foundationsSchema);
    const original = indicator(before, 'procedures').versions[0]!;
    const mitigation = indicator(before, 'mitigation_plan').versions[0]!;
    await request(`${path}/mitigation_plan/review`, foundationsSchema, {
      method: 'PUT',
      json: { versionId: mitigation.id, checks: [pass, pass, pass, pass] },
    });
    await signInAs('focal-demo-008');
    await request(
      `/api/foundation-versions/${mitigation.id}/withdraw`,
      foundationsSchema,
      {
        method: 'POST',
        json: { reason: 'Adopted in error; a new plan is being drafted.' },
      },
    );
    // A replacement recorded now takes effect only after the cutoff.
    const body = uploadForm('procedures-v2.pdf', pdfBytes('2'), 'procedures');
    body.append('kind', 'procedures');
    body.append('approvalReference', 'Board resolution 12 Jun 2027');
    body.append('effectiveFrom', '2027-09-01');
    body.append('claimedChecks', JSON.stringify([true, true, true, true]));
    await request(path, foundationsSchema, { method: 'POST', body });

    await signInAs('officer-b');
    const unsupported = (reason: string) =>
      request(`${path}/mitigation_plan/unsupported`, foundationsSchema, {
        method: 'POST',
        json: { reason },
      });
    await expect(
      unsupported('The plan was withdrawn and no replacement was adopted.'),
    ).rejects.toMatchObject({ status: 409, code: 'cutoff_not_passed' });
    getDb().businessTime = '2027-08-01T09:00:00+03:00';
    for (const quarter of [1, 2, 3, 4])
      await request(
        `/api/obligations/${encodeURIComponent(`DEMO-008:FY2026-27-Q${quarter}`)}/close-nonresponse`,
        z.unknown(),
        {
          method: 'POST',
          json: { reason: 'No report was received for this quarter.' },
        },
      );
    const risk = indicator(before, 'risk_assessment').versions[0]!;
    await request(`${path}/risk_assessment/review`, foundationsSchema, {
      method: 'PUT',
      json: { versionId: risk.id, checks: [pass, pass, pass, pass] },
    });
    const withSuccessor = await request(path, foundationsSchema);
    expect(indicator(withSuccessor, 'procedures').atCutoff).toEqual({
      status: 'applicable',
      versionId: original.id,
    });
    expect(indicator(withSuccessor, 'mitigation_plan').atCutoff).toEqual({
      status: 'none',
    });

    // The superseded version effective at the cutoff can still be reviewed; the withdrawn one cannot.
    const failed = {
      outcome: 'fail' as const,
      passage: '',
      reason: 'No approval details are recorded.',
    };
    const reviewed = await request(
      `${path}/procedures/review`,
      foundationsSchema,
      {
        method: 'PUT',
        json: { versionId: original.id, checks: [pass, pass, pass, failed] },
      },
    );
    expect(indicator(reviewed, 'procedures').cutoffReview).toMatchObject({
      versionId: original.id,
    });
    await expect(
      request(`${path}/mitigation_plan/review`, z.unknown(), {
        method: 'PUT',
        json: { versionId: mitigation.id, checks: [pass, pass, pass, pass] },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'not_active' });

    // The withdrawn plan's earlier 4/4 gives no credit: pending until an explicit disposition.
    await signInAs('administrator');
    const demo8 = async () =>
      (await request('/api/annual', annualOverviewSchema)).institutions.find(
        (evaluation) => evaluation.institutionId === 'DEMO-008',
      )!;
    expect((await demo8()).total).toMatchObject({
      status: 'pending',
      reasons: [
        'Mitigation plan has no valid version at the cutoff: record an unsupported disposition or a valid replacement',
      ],
    });
    await signInAs('officer-b');
    await expect(
      request(`${path}/procedures/unsupported`, z.unknown(), {
        method: 'POST',
        json: { reason: 'No valid procedures document at the cutoff.' },
      }),
    ).rejects.toMatchObject({ status: 409, code: 'version_at_cutoff' });
    await expect(unsupported('short')).rejects.toMatchObject({
      status: 422,
      code: 'reason_required',
    });
    const disposed = await unsupported(
      'The plan was withdrawn and no replacement was adopted.',
    );
    expect(indicator(disposed, 'mitigation_plan').cutoffReview).toMatchObject({
      versionId: null,
    });

    // Procedures 10 × 3/4 + risk 15 + mitigation 0; every quarter closed: 22.50.
    await signInAs('administrator');
    const final = await demo8();
    expect(final.total).toMatchObject({
      status: 'calculated',
      points: '22.50',
      foundationPoints: '22.50',
    });
    expect(
      final.foundations.map((foundation) => [
        foundation.kind,
        foundation.versionId,
        foundation.score.status === 'calculated' && foundation.score.points,
      ]),
    ).toEqual([
      ['procedures', original.id, '7.50'],
      ['risk_assessment', risk.id, '15.00'],
      ['mitigation_plan', null, '0.00'],
    ]);
    // History is kept: the earlier review of the withdrawn plan is still recorded.
    expect(
      getDb().foundationReviews.filter(
        (review) =>
          review.institutionId === 'DEMO-008' &&
          review.kind === 'mitigation_plan',
      ),
    ).toHaveLength(2);
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

describe('evidence downloads (PRD §5.2)', () => {
  it('serves a file to its institution, and to the assigned officer only once submitted', async () => {
    const file = (id: string) => requestFile(`/api/evidence/${id}/file`);
    await publishSeedForm();
    await signInAs('focal-demo-001');
    const { draft, upload } = await completeDraft('DEMO-001');
    expect(new Uint8Array(await (await file(upload.id)).arrayBuffer())).toEqual(
      pdfBytes(),
    );
    // Drafts are private to the institution.
    await signInAs('officer-a');
    await expect(file(upload.id)).rejects.toMatchObject({ status: 404 });
    await signInAs('focal-demo-001');
    await submitDraft('DEMO-001', draft.version);
    await signInAs('officer-a');
    expect((await file(upload.id)).size).toBe(pdfBytes().byteLength);
    await signInAs('officer-b');
    await expect(file(upload.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('supervisor oversight (PRD §5.2, §7.3)', () => {
  it('reads any submission and comments without deciding', async () => {
    const item = await submittedQ1('DEMO-005', 'officer-b');
    await signInAs('supervisor');
    const path = `/api/reviews/${item.submissionId}` as const;
    const bundle = await request(path, reviewBundleSchema);
    expect(bundle.canDecide).toBe(false);
    const commented = await request(`${path}/comments`, reviewBundleSchema, {
      method: 'POST',
      json: { text: 'Please check the minutes cover the Q1 training.' },
    });
    expect(commented.comments).toHaveLength(1);
    await expect(
      request(`${path}/decisions/M-05`, z.unknown(), {
        method: 'PUT',
        json: { outcome: 'accepted', reason: '', revision: 1 },
      }),
    ).rejects.toMatchObject({ status: 403 });
    // Officers read comments but cannot add them.
    await signInAs('officer-b');
    expect(
      (await request(path, reviewBundleSchema)).comments[0]?.text,
    ).toContain('Q1 training');
    await expect(
      request(`${path}/comments`, z.unknown(), {
        method: 'POST',
        json: { text: 'Officers cannot post oversight comments.' },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('cutoff fairness and extensions (PRD §7.3, AT29)', () => {
  it('keeps the full window, holds release until an authorized extension ends, then allows closure', async () => {
    const item = await submittedQ1();
    // Two calendar days before the cutoff, the officer asks a question.
    getDb().businessTime = '2027-07-29T10:00:00+03:00';
    const asked = await clarify(item.submissionId);
    const open = asked.clarifications[0]!;
    expect(open.responseDueAt).toBe('2027-08-05T23:59:59+03:00');
    expect(open.extensionRequired).toBe(true);

    await signInAs('administrator');
    let annual = await request('/api/annual', annualOverviewSchema);
    const demo1 = () =>
      annual.institutions.find((row) => row.institutionId === 'DEMO-001')!;
    expect(demo1().extensionRequired).toBe(true);
    expect(demo1().releasable).toBe(false);
    const extend = (untilDate: string) =>
      request('/api/annual/extensions', z.unknown(), {
        method: 'POST',
        json: {
          institutionId: 'DEMO-001',
          untilDate,
          reason: 'Clarification raised close to the cutoff.',
          authorizedBy: 'Head of Prevention (fictional)',
        },
      });
    // The window is never shortened.
    await expect(extend('2027-08-02')).rejects.toMatchObject({ status: 422 });
    await extend('2027-08-10');
    annual = await request('/api/annual', annualOverviewSchema);
    expect(demo1().extensionRequired).toBe(false);
    expect(demo1().holds[0]).toMatch(/Evaluation extended to 2027-08-10/);

    const close = () =>
      request(
        `/api/reviews/${item.submissionId}/clarifications/${open.id}/close`,
        reviewBundleSchema,
        {
          method: 'POST',
          json: { reason: 'No response by the end of the extension.' },
        },
      );
    await signInAs('officer-a');
    getDb().businessTime = '2027-08-06T09:00:00+03:00';
    await expect(close()).rejects.toMatchObject({
      status: 409,
      code: 'window_open',
    });
    getDb().businessTime = '2027-08-11T09:00:00+03:00';
    const closed = await close();
    expect(closed.clarifications[0]).toMatchObject({
      status: 'closed_unanswered',
    });
    expect(closed.item.state).toBe('under_review');
  });
});

describe('evidence lookup (FR15)', () => {
  it('lists only files in the caller’s scope, with filters', async () => {
    await submittedQ1();
    await signInAs('officer-a');
    const mine = await request('/api/evidence', evidenceLookupSchema);
    expect(mine.map((row) => row.evidence.fileName)).toEqual([
      'cpc-minutes.pdf',
    ]);
    expect(mine[0]).toMatchObject({
      institutionId: 'DEMO-001',
      suitability: 'not_checked',
      citedBy: ['M-01', 'M-02', 'M-03', 'M-04'],
    });
    expect(
      await request('/api/evidence?category=iao_minutes', evidenceLookupSchema),
    ).toEqual([]);
    // Another officer's lookup has no trace of DEMO-001's files.
    await signInAs('officer-b');
    expect(await request('/api/evidence', evidenceLookupSchema)).toEqual([]);
    await signInAs('focal-demo-001');
    await expect(
      request('/api/evidence', evidenceLookupSchema),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('administrator override (FR10)', () => {
  it('acts only with a justification and records every use', async () => {
    const item = await submittedQ1();
    await signInAs('administrator');
    const path = `/api/reviews/${item.submissionId}` as const;
    expect((await request(path, reviewBundleSchema)).canOverride).toBe(true);
    const reject = (headers?: Record<string, string>) =>
      request(`${path}/decisions/M-01`, reviewBundleSchema, {
        method: 'PUT',
        headers,
        json: {
          outcome: 'rejected',
          reason: 'Minutes do not record the review.',
          revision: 1,
        },
      });
    await expect(reject()).rejects.toMatchObject({ status: 403 });
    await expect(
      reject({ 'X-Override-Reason': 'Officer away' }),
    ).rejects.toMatchObject({ status: 422 });
    await reject({
      'X-Override-Reason':
        'Officer A is on unplanned leave until after the cutoff.',
    });
    expect(
      getDb().audit.filter((event) => event.action === 'review.override'),
    ).toHaveLength(1);
  });
});
