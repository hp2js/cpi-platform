// @vitest-environment node
import {
  planImportPreviewSchema,
  planImportResultSchema,
  planSchema,
  simulationStateSchema,
  type Plan,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const Q2 = 'FY2026-27-Q2';
const plan = (institutionId: string) =>
  request(`/api/institutions/${institutionId}/plan`, planSchema);
const send = (method: string, path: string, json?: object) =>
  request(`/api/institutions/DEMO-004${path}`, planSchema, { method, json });
const latest = (current: Plan, periodId: string) =>
  current.baselines
    .filter((baseline) => baseline.periodId === periodId)
    .at(-1)!;

const risk = {
  code: 'R-03',
  description: 'Collusion in debt settlement',
  cause: 'One officer negotiates and approves settlements.',
  probability: 3,
  impact: 5,
};

describe('the institution maintains its plan (FR04)', () => {
  it('records risks, activities and milestones, and only its own focal persons edit them', async () => {
    await signInAs('focal-demo-004');
    let current = await plan('DEMO-004');
    expect(current.editable).toBe(true);
    expect(current.approval).toMatchObject({
      approvingBody: 'Corruption Prevention Committee',
      documentVersionId: 'fv-DEMO-004-mitigation_plan-1',
    });
    expect(current.activities.map((activity) => activity.code)).toEqual([
      'A-01',
      'A-02',
      'A-03',
      'A-99',
    ]);

    current = await send('POST', '/risks', risk);
    const added = current.risks.find((item) => item.code === 'R-03')!;
    expect(added.severity).toBe(15);
    await expect(send('POST', '/risks', risk)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { code: 'R-03 is already in the plan. Use another code.' },
    });
    current = await send('POST', '/activities', {
      code: 'a-04',
      riskId: added.id,
      title: 'Separate negotiation from approval',
      strategy: 'Segregate duties in settlements.',
      output: 'Revised settlement procedure',
      kpi: 'Settlements approved by a second officer',
      target: '100% from Q2',
      owner: 'Head of debt management',
      resourceReference: '',
    });
    const activity = current.activities.find((item) => item.code === 'A-04')!;
    await expect(
      send('DELETE', `/risks/${encodeURIComponent(added.id)}`),
    ).rejects.toMatchObject({ status: 409, code: 'risk_in_use' });

    // Q1 has opened for reporting, so its milestones are fixed.
    const milestone = {
      code: 'M-40',
      activityId: activity.id,
      periodId: 'FY2026-27-Q1',
      title: 'Settlement procedure revised',
      completionCondition: 'The revised procedure was approved and circulated.',
      evidenceExpectation: 'CPC minutes approving the procedure.',
    };
    await expect(
      send('POST', '/plan-milestones', milestone),
    ).rejects.toMatchObject({ status: 409, code: 'baseline_locked' });
    current = await send('POST', '/plan-milestones', {
      ...milestone,
      periodId: Q2,
    });
    expect(
      current.proposals.find((proposal) => proposal.periodId === Q2),
    ).toMatchObject({ status: 'proposed', changedSinceProposal: true });

    // Officers read the plan but cannot edit it; another institution cannot see it.
    await signInAs('officer-a');
    expect((await plan('DEMO-004')).editable).toBe(false);
    await expect(send('POST', '/risks', risk)).rejects.toMatchObject({
      status: 403,
    });
    await signInAs('focal-demo-003');
    await expect(send('POST', '/risks', risk)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('records the plan approval, checking the date and the plan document', async () => {
    await signInAs('focal-demo-002');
    const record = {
      approvingBody: 'Board of Directors',
      approvedOn: '2026-08-30',
      reference: 'Board resolution 12/2026',
      accountingOfficer: 'Chief Executive Officer',
      documentVersionId: 'fv-DEMO-002-mitigation_plan-1',
    };
    const put = (json: object) =>
      request('/api/institutions/DEMO-002/plan/approval', planSchema, {
        method: 'PUT',
        json,
      });
    await expect(
      put({ ...record, approvedOn: '2027-01-01' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      put({ ...record, documentVersionId: 'fv-DEMO-001-mitigation_plan-1' }),
    ).rejects.toMatchObject({ status: 422 });
    const saved = await put(record);
    expect(saved.approvedPlanReference).toBe(
      'Board resolution 12/2026, approved by the Board of Directors on 30 Aug 2026',
    );
    expect(getDb().audit.at(-1)?.action).toBe('plan.approval_record');
  });
});

describe('proposing a quarter’s baseline (FR04, AT31)', () => {
  it('returns with the failed checks, and the institution corrects its plan and proposes again', async () => {
    await signInAs('officer-a');
    const inflated = latest(await plan('DEMO-004'), Q2);
    await expect(
      request(`/api/baselines/${inflated.id}/return`, z.unknown(), {
        method: 'POST',
        json: { version: 1, reason: 'Administrative tasks split the plan.' },
      }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: {
        failedChecks: 'Choose at least one check that is not met.',
      },
    });
    await request(`/api/baselines/${inflated.id}/return`, z.unknown(), {
      method: 'POST',
      json: {
        version: 1,
        reason: 'Administrative tasks split the plan.',
        failedChecks: ['noFragmentation'],
      },
    });

    await signInAs('focal-demo-004');
    let current = await plan('DEMO-004');
    expect(latest(current, Q2).returned?.failedChecks).toEqual([
      'noFragmentation',
    ]);
    const trivial = current.plannedMilestones.filter(
      (milestone) =>
        milestone.periodId === Q2 && milestone.activityId === 'DEMO-004:A-99',
    );
    expect(trivial).toHaveLength(8);
    for (const milestone of trivial)
      await send(
        'DELETE',
        `/plan-milestones/${encodeURIComponent(milestone.id)}`,
      );
    current = await send('POST', `/baselines/${Q2}/propose`, {
      note: 'Administrative tasks removed.',
    });
    const proposed = latest(current, Q2);
    expect(proposed).toMatchObject({ version: 2, status: 'proposed' });
    // The substantive milestones keep their identity; the committee meetings carry over.
    expect(proposed.milestones.map((milestone) => milestone.code)).toEqual([
      'M-05',
      'M-06',
      'M-07',
      'M-08',
    ]);
    expect(
      proposed.milestones.filter((milestone) => milestone.mandatory),
    ).toHaveLength(2);
    await expect(
      send('POST', `/baselines/${Q2}/propose`, { note: '' }),
    ).rejects.toMatchObject({ status: 409, code: 'already_proposed' });
    expect(
      getDb().notifications.some(
        (notification) =>
          notification.recipientId === 'officer-a' &&
          notification.eventType === 'baseline.proposed' &&
          notification.title === 'Baseline proposed: DEMO-004 Q2',
      ),
    ).toBe(true);
  });

  it('refuses an empty proposal, and new committee meetings are added to a first proposal', async () => {
    await signInAs('focal-demo-001');
    const current = await plan('DEMO-001');
    const q3 = current.plannedMilestones.filter(
      (milestone) => milestone.periodId === 'FY2026-27-Q3',
    );
    // Start Q3 again from nothing: the seeded proposal is replaced by the institution's own.
    getDb().baselines = getDb().baselines.filter(
      (baseline) =>
        !(
          baseline.institutionId === 'DEMO-001' &&
          baseline.periodId === 'FY2026-27-Q3'
        ),
    );
    for (const milestone of q3)
      await request(
        `/api/institutions/DEMO-001/plan-milestones/${encodeURIComponent(milestone.id)}`,
        planSchema,
        { method: 'DELETE' },
      );
    const propose = () =>
      request(
        '/api/institutions/DEMO-001/baselines/FY2026-27-Q3/propose',
        planSchema,
        { method: 'POST', json: { note: '' } },
      );
    await expect(propose()).rejects.toMatchObject({
      status: 422,
      code: 'empty_baseline',
    });
    await request('/api/institutions/DEMO-001/plan-milestones', planSchema, {
      method: 'POST',
      json: {
        code: 'M-30',
        activityId: 'DEMO-001:A-03',
        periodId: 'FY2026-27-Q3',
        title: 'Procurement spot-check',
        completionCondition:
          'Ten approvals were sampled and findings recorded.',
        evidenceExpectation: 'Spot-check findings.',
      },
    });
    const proposed = latest(await propose(), 'FY2026-27-Q3');
    expect(proposed.milestones.map((milestone) => milestone.code)).toEqual([
      'M-30',
      'CPC-Q3',
      'IAO-Q3',
    ]);
    expect(proposed.milestones[0]).toMatchObject({
      activity: 'A-03 Spot-check procurement approvals',
      risk: 'R-02 Weak oversight of procurement approvals',
      activityId: 'DEMO-001:A-03',
    });
  });

  it('gives each quarter a proposal date before it starts and escalates quarters under way unapproved', async () => {
    await signInAs('focal-demo-001');
    const proposals = (await plan('DEMO-001')).proposals;
    expect(proposals.find((item) => item.periodId === Q2)).toMatchObject({
      dueAt: '2026-09-17T23:59:59+03:00',
      startsAt: '2026-10-01T00:00:00+03:00',
    });

    await signInAs('administrator');
    await request('/api/simulation/advance', simulationStateSchema, {
      method: 'POST',
      json: { boundaryId: 'Q1-reminder-7' },
    });
    const digest = getDb()
      .notifications.filter(
        (notification) =>
          notification.recipientId === 'supervisor' &&
          notification.eventType === 'oversight.digest',
      )
      .at(-1);
    expect(digest?.body).toMatch(
      /8 quarters have started without an approved baseline \(DEMO-001 Q2, DEMO-002 Q2, DEMO-003 Q2, …\)/,
    );
  });
});

describe('importing a plan from a CSV (FR04)', () => {
  const header =
    'record,code,link,quarter,title,cause,probability,impact,strategy,output,kpi,target,owner,resource,completion_condition,evidence_expectation';
  const csv = (rows: string[]) => ({ csv: [header, ...rows].join('\n') });
  const previewPlan = (rows: string[]) =>
    request(
      '/api/institutions/DEMO-007/plan/import/preview',
      planImportPreviewSchema,
      { method: 'POST', json: csv(rows) },
    );
  const importPlan = (rows: string[]) =>
    request('/api/institutions/DEMO-007/plan/import', planImportResultSchema, {
      method: 'POST',
      json: csv(rows),
    });

  it('previews row by row, links by code and imports all or nothing', async () => {
    await signInAs('focal-demo-007');
    const rows = [
      'milestone,M-50,A-05,Q3,Awards audited,,,,,,,,,,An independent audit of awards was completed.,Audit report',
      'risk,R-03,,,Conflicts of interest in panels,Panel members are not asked to declare,3,4,,,,,,,,',
      'activity,A-05,R-03,,Declare conflicts before each panel,,,,Require declarations,Declaration register,Panels with full declarations,100%,Bursary secretary,,,',
      'risk,R-01,,,Favouritism in bursary awards (updated),Criteria applied inconsistently,4,4,,,,,,,,',
    ];
    const bad = [
      'milestone,M-51,A-77,Q1,Old quarter,,,,,,,,,,Something was done in the quarter.,Minutes',
      'risk,R-04,,,Short,x,9,4,,,,,,,,',
      'objective,O-01,,,Unknown record,,,,,,,,,,,',
    ];
    const preview = await previewPlan([...rows, ...bad]);
    expect(preview).toMatchObject({ valid: 4, invalid: 3 });
    expect(preview.rows.map((row) => row.action)).toEqual([
      'add',
      'add',
      'add',
      'update',
      'add',
      'add',
      'add',
    ]);
    expect(preview.rows[4]!.errors).toEqual([
      'link: No activity A-77 in the plan or this file.',
      'quarter: The Q1 baseline is approved or locked; request an amendment instead.',
    ]);
    expect(preview.rows[5]!.errors).toEqual([
      'cause: Enter at least 2 characters.',
      'probability: Choose a value from 1 to 5.',
    ]);
    expect(preview.rows[6]!.errors).toEqual([
      'record: Use risk, activity or milestone.',
    ]);
    await expect(importPlan([...rows, ...bad])).rejects.toMatchObject({
      status: 422,
      code: 'import_invalid',
    });

    expect(await importPlan(rows)).toEqual({
      risks: 2,
      activities: 1,
      milestones: 1,
    });
    const current = await plan('DEMO-007');
    expect(current.risks.find((item) => item.code === 'R-01')).toMatchObject({
      probability: 4,
      severity: 16,
    });
    const activity = current.activities.find((item) => item.code === 'A-05')!;
    expect(activity.riskId).toBe(
      current.risks.find((item) => item.code === 'R-03')!.id,
    );
    expect(
      current.plannedMilestones.find((item) => item.code === 'M-50'),
    ).toMatchObject({ activityId: activity.id, periodId: 'FY2026-27-Q3' });
  });
});
