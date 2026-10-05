import type { Baseline, Foundations, Plan, ReviewBundle } from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { integration, startApi } from '../test/api';
import {
  completeDraft,
  decideAll,
  passSuitability,
  pdf,
  publishSeedForm,
  submitDraft,
} from '../test/journeys';

/** Ported from apps/web/src/mocks/safeguards.test.ts (FR04, AT17, AT25, AT28, AT31). */
describe.skipIf(!integration)('plan baselines and foundations', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());

  const latest = (plan: Plan, periodId: string) =>
    plan.baselines.filter((baseline) => baseline.periodId === periodId).at(-1)!;
  const checks = {
    materialCoverage: true,
    objectiveConditions: true,
    mandatoryObligations: true,
    noFragmentation: true,
  };

  it('requires every check and a rationale, and lets the officer return an inflated proposal (AT31)', async () => {
    const officer = await api.client().signIn('officer-a');
    const plan = await officer.json<Plan>('/institutions/DEMO-004/plan');
    expect(plan.risks[0]).toMatchObject({ severity: expect.any(Number) });
    const inflated = latest(plan, 'FY2026-27-Q2');
    expect(inflated.milestones).toHaveLength(12);
    const lockedQ1 = latest(plan, 'FY2026-27-Q1');
    expect(lockedQ1.milestones).toHaveLength(4);
    expect(
      await officer.post(`/baselines/${inflated.id}/approve`, {
        version: 1,
        rationale:
          'Material coverage must be confirmed before this proposal can activate.',
        checks: { ...checks, noFragmentation: false },
      }),
    ).toMatchObject({ status: 422 });

    expect(
      (
        await officer.post(`/baselines/${inflated.id}/approve`, {
          version: 1,
          rationale: 'ok',
          checks,
        })
      ).status,
    ).toBe(422);
    const returned = (
      await officer.post(`/baselines/${inflated.id}/return`, {
        version: 1,
        reason:
          'Eight administrative tasks artificially split the plan and dilute committee obligations.',
        failedChecks: ['noFragmentation'],
      })
    ).body as Baseline;
    expect(returned).toMatchObject({
      status: 'returned',
      returned: { failedChecks: ['noFragmentation'] },
    });
    const outsider = await api.client().signIn('officer-b');
    expect(
      (
        await outsider.post(`/baselines/${inflated.id}/approve`, {
          version: 1,
          rationale: 'x'.repeat(30),
          checks,
        })
      ).status,
    ).toBe(404);

    // The institution drops the administrative tasks from its plan and proposes again.
    const focal = await api.client().signIn('focal-demo-004');
    const own = await focal.json<Plan>('/institutions/DEMO-004/plan');
    for (const milestone of own.plannedMilestones.filter(
      (item) =>
        item.periodId === 'FY2026-27-Q2' && item.activityId === 'DEMO-004:A-99',
    ))
      await focal.delete(
        `/institutions/DEMO-004/plan-milestones/${encodeURIComponent(milestone.id)}`,
      );
    const revised = await focal.post(
      '/institutions/DEMO-004/baselines/FY2026-27-Q2/propose',
      { note: 'Administrative tasks removed.' },
    );
    expect(revised.status).toBe(201);
    const proposal = latest(revised.body as Plan, 'FY2026-27-Q2');
    expect(proposal).toMatchObject({ version: 2, status: 'proposed' });
    expect(proposal.milestones.map((milestone) => milestone.code)).toEqual([
      'M-05',
      'M-06',
      'M-07',
      'M-08',
    ]);
    const approved = (
      await officer.post(`/baselines/${proposal.id}/approve`, {
        version: 2,
        rationale: 'Proportionate plan with both committee obligations.',
        checks,
      })
    ).body as Baseline;
    expect(approved).toMatchObject({ status: 'approved', version: 2 });
    expect(
      latest(
        await officer.json<Plan>('/institutions/DEMO-004/plan'),
        'FY2026-27-Q1',
      ).milestones,
    ).toEqual(lockedQ1.milestones);

    // Version 1 is kept.
    expect(
      (await officer.json<Plan>('/institutions/DEMO-004/plan')).baselines
        .filter((baseline) => baseline.periodId === 'FY2026-27-Q2')
        .map((baseline) => baseline.status),
    ).toEqual(['returned', 'approved']);
  });

  it('versions confirmed amendments for unopened periods and refuses opened ones (AT17)', async () => {
    const focal = await api.client().signIn('focal-demo-006');
    const plan = await focal.json<Plan>('/institutions/DEMO-006/plan');
    const q1 = latest(plan, 'FY2026-27-Q1');
    expect(q1.locked).toBe(true);
    expect(
      await focal.delete(
        `/institutions/DEMO-006/plan-milestones/${encodeURIComponent(q1.milestones[1]!.id)}`,
      ),
    ).toMatchObject({ status: 409, body: { code: 'baseline_locked' } });
    expect(
      latest(await focal.json<Plan>('/institutions/DEMO-006/plan'), q1.periodId)
        .milestones,
    ).toEqual(q1.milestones);

    const request = (body: object) =>
      focal.post('/institutions/DEMO-006/amendments', body);
    expect(
      await request({
        periodId: q1.periodId,
        milestoneId: q1.milestones[1]!.id,
        change: 'remove',
        toPeriodId: null,
        reason: 'Training moved to next year.',
      }),
    ).toMatchObject({ status: 409, body: { code: 'baseline_locked' } });
    const q2 = latest(plan, 'FY2026-27-Q2');
    // A proposed baseline is changed through the plan, not amended.
    expect(
      await request({
        periodId: q2.periodId,
        milestoneId: q2.milestones[0]!.id,
        change: 'remove',
        toPeriodId: null,
        reason: 'We will not need this milestone.',
      }),
    ).toMatchObject({ status: 409, body: { code: 'baseline_not_approved' } });
    const officer = await api.client().signIn('officer-b');
    await officer.post(`/baselines/${q2.id}/approve`, {
      version: q2.version,
      rationale: 'Covers the material risks with objective conditions.',
      checks,
    });
    expect(
      await request({
        periodId: q2.periodId,
        milestoneId: q2.milestones.find((m) => m.mandatory)!.id,
        change: 'remove',
        toPeriodId: null,
        reason: 'We will skip this meeting.',
      }),
    ).toMatchObject({ status: 422, body: { code: 'mandatory_milestone' } });
    const asked = await request({
      periodId: q2.periodId,
      milestoneId: q2.milestones[1]!.id,
      change: 'reschedule',
      toPeriodId: 'FY2026-27-Q3',
      reason: 'Spot-check team is only available in Q3.',
    });
    expect(asked).toMatchObject({ status: 201, body: { status: 'pending' } });
    const after = (
      await officer.post(
        `/amendments/${(asked.body as { id: string }).id}/decision`,
        {
          decision: 'confirmed',
          reason: 'Reasonable resourcing constraint; denominator preserved.',
        },
      )
    ).body as Plan;
    const lengths = (periodId: string) =>
      after.baselines
        .filter((baseline) => baseline.periodId === periodId)
        .map((baseline) => baseline.milestones.length);
    expect(lengths('FY2026-27-Q2')).toEqual([4, 3]);
    expect(lengths('FY2026-27-Q3').at(-1)).toBe(5);
    // The plan follows the confirmed amendment, so a later proposal keeps the move.
    expect(
      after.plannedMilestones.find(
        (milestone) => milestone.id === q2.milestones[1]!.id,
      )?.periodId,
    ).toBe('FY2026-27-Q3');
    expect(after.amendments[0]).toMatchObject({
      status: 'confirmed',
      decidedBy: 'Prevention Officer B',
    });
  });

  it('confirms a seeded historical baseline so the quarter can be finalized (AT25)', async () => {
    await publishSeedForm(await api.client().signIn('administrator'));
    const focal = await api.client().signIn('focal-demo-001');
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    const officer = await api.client().signIn('officer-a');
    const [item] = await officer.json<{ submissionId: string }[]>('/reviews');
    await passSuitability(officer, item!.submissionId);
    await decideAll(officer, item!.submissionId, 1);
    const q1 = latest(
      await officer.json<Plan>('/institutions/DEMO-001/plan'),
      'FY2026-27-Q1',
    );
    expect(q1.historicalSeed?.confirmedAt).toBeNull();
    const beforeConfirmation = await officer.json<ReviewBundle>(
      `/reviews/${item!.submissionId}`,
    );
    expect(
      (
        await officer.post(`/reviews/${item!.submissionId}/finalize`, {
          revision: 1,
        })
      ).status,
    ).toBe(422);

    const confirmed = (
      await officer.post(`/baselines/${q1.id}/confirm-seed`, {
        version: q1.version,
      })
    ).body as Baseline;
    expect(confirmed.historicalSeed).toMatchObject({
      confirmedBy: 'Prevention Officer A',
      confirmedAt: '2026-10-01T08:00:00+03:00',
    });
    expect(
      await officer.post(`/baselines/${q1.id}/confirm-seed`, {
        version: q1.version,
      }),
    ).toMatchObject({ status: 409, body: { code: 'already_confirmed' } });
    const final = (
      await officer.post(`/reviews/${item!.submissionId}/finalize`, {
        revision: 1,
      })
    ).body as ReviewBundle;
    expect(final.item.state).toBe('finalized');
    expect(confirmed.historicalSeed?.loadedAt).toBe(
      q1.historicalSeed?.loadedAt,
    );
    expect(confirmed.milestones).toEqual(q1.milestones);
    expect(final.answers).toEqual(beforeConfirmation.answers);
    expect(final.receipt).toEqual(beforeConfirmation.receipt);
  });

  it('scores claimed checks provisionally, reviewed checks after review, and drops credit on supersession (AT28)', async () => {
    const officer = await api.client().signIn('officer-b');
    const initial = await officer.json<Foundations>(
      '/institutions/DEMO-005/foundations',
    );
    const risk = initial.indicators.find(
      (indicator) => indicator.kind === 'risk_assessment',
    )!;
    expect(risk.provisional).toMatchObject({ points: '11.25' });
    expect(risk.reviewed).toMatchObject({ status: 'pending' });
    const pass = { outcome: 'pass' as const, passage: 'Section 2', reason: '' };
    const review = (third: object) =>
      officer.put('/institutions/DEMO-005/foundations/risk_assessment/review', {
        versionId: risk.versions[0]!.id,
        checks: [pass, pass, third, pass],
      });
    expect(
      (await review({ outcome: 'fail', passage: '', reason: '' })).status,
    ).toBe(422);
    const reviewed = (
      await review({
        outcome: 'fail',
        passage: '',
        reason: 'No probability or impact scores are given.',
      })
    ).body as Foundations;
    expect(
      reviewed.indicators.find(
        (indicator) => indicator.kind === 'risk_assessment',
      )!.reviewed,
    ).toMatchObject({ points: '11.25' });

    const focal = await api.client().signIn('focal-demo-005');
    const own = await focal.json<Foundations>(
      '/institutions/DEMO-005/foundations',
    );
    expect(
      own.indicators.every(
        (indicator) =>
          indicator.provisional === null && indicator.reviewed === null,
      ),
    ).toBe(true);
    const uploaded = await focal.upload(
      '/institutions/DEMO-005/foundations',
      { name: 'risk-assessment-v2.pdf', bytes: pdf('risk assessment v2') },
      {
        kind: 'risk_assessment',
        approvalReference: 'CPC resolution 2 Oct 2026',
        effectiveFrom: '2026-10-02',
        claimedChecks: JSON.stringify([true, true, true, true]),
      },
    );
    expect(uploaded.status).toBe(201);

    const after = await officer.json<Foundations>(
      '/institutions/DEMO-005/foundations',
    );
    const updated = after.indicators.find(
      (indicator) => indicator.kind === 'risk_assessment',
    )!;
    expect(updated.versions.map((version) => version.status)).toEqual([
      'active',
      'superseded',
    ]);
    expect(updated.provisional).toMatchObject({ points: '15.00' });
    expect(updated.reviewed).toMatchObject({ status: 'pending' });
    const outsider = await api.client().signIn('officer-a');
    expect(
      (await outsider.request('/institutions/DEMO-005/foundations')).status,
    ).toBe(404);
  });
});
