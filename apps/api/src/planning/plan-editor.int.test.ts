import type { Plan, PlanImportPreview } from '@cpi/contracts';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, notifications } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';

/** Ported from apps/web/src/mocks/plans.test.ts (FR04, AT31). */
describe.skipIf(!integration)('the institution plan', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());

  const Q2 = 'FY2026-27-Q2';
  const latest = (plan: Plan, periodId: string) =>
    plan.baselines.filter((baseline) => baseline.periodId === periodId).at(-1)!;
  const risk = {
    code: 'R-03',
    description: 'Collusion in debt settlement',
    cause: 'One officer negotiates and approves settlements.',
    probability: 3,
    impact: 5,
  };
  const lastAudit = async () =>
    (
      await api.db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.seq))
        .limit(1)
    )[0];

  it('records risks, activities and milestones, and only its own focal persons edit them', async () => {
    const focal = await api.client().signIn('focal-demo-004');
    let plan = await focal.json<Plan>('/institutions/DEMO-004/plan');
    expect(plan.editable).toBe(true);
    expect(plan.approval).toMatchObject({
      approvingBody: 'Corruption Prevention Committee',
      documentVersionId: 'fv-DEMO-004-mitigation_plan-1',
    });
    expect(plan.activities.map((activity) => activity.code)).toEqual([
      'A-01',
      'A-02',
      'A-03',
      'A-99',
    ]);

    plan = (await focal.post('/institutions/DEMO-004/risks', risk))
      .body as Plan;
    const added = plan.risks.find((item) => item.code === 'R-03')!;
    expect(added.severity).toBe(15);
    expect(
      await focal.post('/institutions/DEMO-004/risks', risk),
    ).toMatchObject({
      status: 422,
      body: {
        fieldErrors: { code: 'R-03 is already in the plan. Use another code.' },
      },
    });
    plan = (
      await focal.post('/institutions/DEMO-004/activities', {
        code: 'a-04',
        riskId: added.id,
        title: 'Separate negotiation from approval',
        strategy: 'Segregate duties in settlements.',
        output: 'Revised settlement procedure',
        kpi: 'Settlements approved by a second officer',
        target: '100% from Q2',
        owner: 'Head of debt management',
        resourceReference: '',
      })
    ).body as Plan;
    const activity = plan.activities.find((item) => item.code === 'A-04')!;
    expect(
      await focal.delete(
        `/institutions/DEMO-004/risks/${encodeURIComponent(added.id)}`,
      ),
    ).toMatchObject({ status: 409, body: { code: 'risk_in_use' } });

    const milestone = {
      code: 'M-40',
      activityId: activity.id,
      periodId: 'FY2026-27-Q1',
      title: 'Settlement procedure revised',
      completionCondition: 'The revised procedure was approved and circulated.',
      evidenceExpectation: 'CPC minutes approving the procedure.',
    };
    // Q1 has opened for reporting, so its milestones are fixed.
    expect(
      await focal.post('/institutions/DEMO-004/plan-milestones', milestone),
    ).toMatchObject({ status: 409, body: { code: 'baseline_locked' } });
    plan = (
      await focal.post('/institutions/DEMO-004/plan-milestones', {
        ...milestone,
        periodId: Q2,
      })
    ).body as Plan;
    expect(
      plan.proposals.find((proposal) => proposal.periodId === Q2),
    ).toMatchObject({ status: 'proposed', changedSinceProposal: true });

    const officer = await api.client().signIn('officer-a');
    expect(
      (await officer.json<Plan>('/institutions/DEMO-004/plan')).editable,
    ).toBe(false);
    expect(
      (await officer.post('/institutions/DEMO-004/risks', risk)).status,
    ).toBe(403);
    const other = await api.client().signIn('focal-demo-003');
    expect(
      (await other.post('/institutions/DEMO-004/risks', risk)).status,
    ).toBe(404);
  });

  it('records the plan approval, checking the date and the plan document', async () => {
    const focal = await api.client().signIn('focal-demo-002');
    const record = {
      approvingBody: 'Board of Directors',
      approvedOn: '2026-08-30',
      reference: 'Board resolution 12/2026',
      accountingOfficer: 'Chief Executive Officer',
      documentVersionId: 'fv-DEMO-002-mitigation_plan-1',
    };
    const put = (body: object) =>
      focal.put('/institutions/DEMO-002/plan/approval', body);
    expect((await put({ ...record, approvedOn: '2027-01-01' })).status).toBe(
      422,
    );
    expect(
      (
        await put({
          ...record,
          documentVersionId: 'fv-DEMO-001-mitigation_plan-1',
        })
      ).status,
    ).toBe(422);
    const saved = (await put(record)).body as Plan;
    expect(saved.approvedPlanReference).toBe(
      'Board resolution 12/2026, approved by the Board of Directors on 30 Aug 2026',
    );
    expect((await lastAudit())?.action).toBe('plan.approval_record');
  });

  it('proposes a quarter from the plan, refusing an empty or unchanged proposal', async () => {
    const focal = await api.client().signIn('focal-demo-001');
    const propose = (note = '') =>
      focal.post('/institutions/DEMO-001/baselines/FY2026-27-Q3/propose', {
        note,
      });
    // The seeded Q3 proposal already holds the planned milestones.
    expect(await propose()).toMatchObject({
      status: 409,
      body: { code: 'already_proposed' },
    });
    const plan = await focal.json<Plan>('/institutions/DEMO-001/plan');
    for (const milestone of plan.plannedMilestones.filter(
      (item) => item.periodId === 'FY2026-27-Q3',
    ))
      await focal.delete(
        `/institutions/DEMO-001/plan-milestones/${encodeURIComponent(milestone.id)}`,
      );
    expect(await propose()).toMatchObject({
      status: 422,
      body: { code: 'empty_baseline' },
    });
    await focal.post('/institutions/DEMO-001/plan-milestones', {
      code: 'M-30',
      activityId: 'DEMO-001:A-03',
      periodId: 'FY2026-27-Q3',
      title: 'Procurement spot-check',
      completionCondition: 'Ten approvals were sampled and findings recorded.',
      evidenceExpectation: 'Spot-check findings.',
    });
    const proposed = latest(
      (await propose('Replaces the earlier proposal.')).body as Plan,
      'FY2026-27-Q3',
    );
    // The quarter keeps its committee milestones.
    expect(proposed.milestones.map((milestone) => milestone.code)).toEqual([
      'M-30',
      'M-11',
      'M-12',
    ]);
    expect(proposed.milestones[0]).toMatchObject({
      activity: 'A-03 Spot-check procurement approvals',
      risk: 'R-02 Weak oversight of procurement approvals',
      activityId: 'DEMO-001:A-03',
    });
    const [notice] = await api.db
      .select()
      .from(notifications)
      .where(eq(notifications.eventType, 'baseline.proposed'));
    expect(notice).toMatchObject({
      recipientId: 'officer-a',
      title: 'Baseline proposed: DEMO-001 Q3',
    });
  });

  it('imports a plan from a CSV after a row-by-row check, all or nothing', async () => {
    const focal: Client = await api.client().signIn('focal-demo-007');
    const header =
      'record,code,link,quarter,title,cause,probability,impact,strategy,output,kpi,target,owner,resource,completion_condition,evidence_expectation';
    const csv = (rows: string[]) => ({ csv: [header, ...rows].join('\n') });
    const rows = [
      'milestone,M-50,A-05,Q3,Awards audited,,,,,,,,,,An independent audit of awards was completed.,Audit report',
      'risk,R-03,,,Conflicts of interest in panels,Panel members are not asked to declare,3,4,,,,,,,,',
      'activity,A-05,R-03,,Declare conflicts before each panel,,,,Require declarations,Declaration register,Panels with full declarations,100%,Bursary secretary,,,',
    ];
    const bad = [
      'milestone,M-51,A-77,Q1,Old quarter,,,,,,,,,,Something was done in the quarter.,Minutes',
      'objective,<b>x</b>,,,Unknown record,,,,,,,,,,,',
    ];
    const preview = (
      await focal.post(
        '/institutions/DEMO-007/plan/import/preview',
        csv([...rows, ...bad]),
      )
    ).body as PlanImportPreview;
    expect(preview).toMatchObject({ valid: 3, invalid: 2 });
    expect(preview.rows[3]!.errors).toEqual([
      'link: No activity A-77 in the plan or this file.',
      'quarter: The Q1 baseline is approved or locked; request an amendment instead.',
    ]);
    expect(preview.rows[4]!.errors).toEqual([
      'record: Use risk, activity or milestone.',
    ]);
    expect(
      await focal.post(
        '/institutions/DEMO-007/plan/import',
        csv([...rows, ...bad]),
      ),
    ).toMatchObject({ status: 422, body: { code: 'import_invalid' } });
    expect(
      await focal.post('/institutions/DEMO-007/plan/import', csv(rows)),
    ).toMatchObject({
      status: 200,
      body: { risks: 1, activities: 1, milestones: 1 },
    });
    const plan = await focal.json<Plan>('/institutions/DEMO-007/plan');
    const activity = plan.activities.find((item) => item.code === 'A-05')!;
    expect(activity.riskId).toBe(
      plan.risks.find((item) => item.code === 'R-03')!.id,
    );
    expect(
      plan.plannedMilestones.find((item) => item.code === 'M-50'),
    ).toMatchObject({ activityId: activity.id, periodId: 'FY2026-27-Q3' });
  });
});
