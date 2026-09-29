import { and, eq, sql } from 'drizzle-orm';
import type {
  Draft,
  EvidenceItem,
  EvidenceLookupItem,
  Receipt,
  ReportBundle,
  ReviewBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditEvents, baselines, systemState } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  completeDraft,
  decideAll,
  obligationPath,
  passSuitability,
  pdf,
  publishSeedForm,
  submitDraft,
} from '../test/journeys';

/**
 * Ported from apps/web/src/mocks/thin-path.test.ts and safeguards.test.ts
 * (AT02, AT09, AT10, AT25, AT27, AT29, AT30, FR10, FR15).
 */
describe.skipIf(!integration)('officer review', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(() => api.reset());

  const setBusinessTime = (businessTime: string) =>
    api.db.update(systemState).set({ businessTime });
  /** The planning module's confirm-seed endpoint, applied directly (AT25). */
  const confirmSeed = (institutionId: string) =>
    api.db
      .update(baselines)
      .set({
        historicalSeed: sql`${baselines.historicalSeed} || '{"confirmedBy":"Prevention Officer A","confirmedAt":"2026-10-01T09:00:00+03:00"}'::jsonb`,
      })
      .where(
        and(
          eq(baselines.institutionId, institutionId),
          eq(baselines.periodId, 'FY2026-27-Q1'),
        ),
      );

  async function submittedQ1(
    institutionId = 'DEMO-001',
    officerId = 'officer-a',
  ) {
    await publishSeedForm(await api.client().signIn('administrator'));
    const focal = await api
      .client()
      .signIn(`focal-${institutionId.toLowerCase()}`);
    const { draft } = await completeDraft(focal, institutionId);
    await submitDraft(focal, institutionId, draft.version);
    const officer = await api.client().signIn(officerId);
    const queue = await officer.json<ReviewQueueItem[]>('/reviews');
    const item = queue.find((row) => row.institutionId === institutionId)!;
    return { focal, officer, item, path: `/reviews/${item.submissionId}` };
  }

  it('records decisions and finalizes the latest revision', async () => {
    const { officer, item, path } = await submittedQ1();
    const initial = await officer.json<ReviewBundle>(path);
    expect(initial.canDecide).toBe(true);
    expect(initial.score.provisional).toMatchObject({
      status: 'calculated',
      points: '60.00',
    });
    expect(initial.score.reviewed).toMatchObject({ status: 'pending' });

    expect(
      (
        await officer.put(`${path}/decisions/M-01`, {
          outcome: 'rejected',
          reason: '',
          revision: 1,
        })
      ).status,
    ).toBe(422);
    expect(
      (await officer.post(`${path}/finalize`, { revision: 1 })).status,
    ).toBe(422);
    const rejected = (
      await officer.put(`${path}/decisions/M-01`, {
        outcome: 'rejected',
        reason: 'Minutes do not record the exception review.',
        revision: 1,
      })
    ).body as ReviewBundle;
    expect(rejected.item.state).toBe('under_review');

    // Evidence suitability (AT30): no credit on an unchecked or deficient file.
    const accept = () =>
      officer.put(`${path}/decisions/M-02`, {
        outcome: 'accepted',
        reason: '',
        revision: 1,
      });
    expect(await accept()).toMatchObject({
      status: 422,
      body: { code: 'suitability_required' },
    });
    const file = initial.evidence[0]!.id;
    const pass = { outcome: 'pass', reason: '' };
    await officer.put(`${path}/evidence/${file}/suitability`, {
      revision: 1,
      checks: {
        institution: pass,
        period: pass,
        relevance: pass,
        approval: pass,
        readability: {
          outcome: 'deficient',
          reason: 'Pages 2 and 3 are an unreadable scan.',
        },
      },
    });
    expect(await accept()).toMatchObject({
      status: 422,
      body: { code: 'evidence_deficient' },
    });
    await passSuitability(officer, item.submissionId);
    await decideAll(officer, item.submissionId, 1, ['M-02', 'M-03', 'M-04']);
    expect(
      await officer.put(`${path}/decisions/M-02`, {
        outcome: 'accepted',
        reason: '',
        revision: 2,
      }),
    ).toMatchObject({ status: 409, body: { code: 'version_conflict' } });
    // A file an accepted claim relies on cannot become deficient underneath it.
    expect(
      await officer.put(`${path}/evidence/${file}/suitability`, {
        revision: 1,
        checks: {
          institution: pass,
          period: pass,
          relevance: pass,
          approval: pass,
          readability: {
            outcome: 'deficient',
            reason: 'Unreadable scan again.',
          },
        },
      }),
    ).toMatchObject({ status: 409, body: { code: 'decision_depends' } });

    // The Q1 baseline is a seeded historical baseline: finalizing waits for confirmation (AT25).
    expect(
      await officer.post(`${path}/finalize`, { revision: 1 }),
    ).toMatchObject({ status: 422, body: { code: 'seed_unconfirmed' } });
    await confirmSeed('DEMO-001');
    const final = (await officer.post(`${path}/finalize`, { revision: 1 }))
      .body as ReviewBundle;
    expect(final.score.reviewed).toMatchObject({
      status: 'calculated',
      points: '45.00',
    });
    expect(final.item.state).toBe('finalized');
    expect(final.canDecide).toBe(false);
    expect(await officer.json<ReviewQueueItem[]>('/reviews')).toEqual([]);
    expect(
      (await officer.json<ReviewQueueItem[]>('/reviews?status=finalized')).map(
        (row) => row.submissionId,
      ),
    ).toEqual([item.submissionId]);
  });

  it('refuses reviewers outside the assignment (AT02)', async () => {
    const { path } = await submittedQ1();
    const outsider = await api.client().signIn('officer-b');
    expect((await outsider.request(path)).status).toBe(404);
    expect(await outsider.json<ReviewQueueItem[]>('/reviews')).toEqual([]);
    const supervisor = await api.client().signIn('supervisor');
    expect((await supervisor.json<ReviewBundle>(path)).canDecide).toBe(false);
    expect(
      (
        await supervisor.put(`${path}/decisions/M-01`, {
          outcome: 'accepted',
          reason: '',
          revision: 1,
        })
      ).status,
    ).toBe(403);
    const focal = await api.client().signIn('focal-demo-001');
    expect((await focal.request('/reviews')).status).toBe(403);
  });

  it('keeps the earlier receipt, re-reviews changed milestones and carries forward only by confirmation (AT09, AT27)', async () => {
    const { focal, officer, item, path } = await submittedQ1();
    await passSuitability(officer, item.submissionId);
    await decideAll(officer, item.submissionId, 1);
    const asked = await officer.post(`${path}/clarifications`, {
      revision: 1,
      items: [
        {
          milestoneCode: 'M-01',
          question: 'Please provide the exception review record.',
          requestedEvidence: 'The signed exception review.',
        },
      ],
    });
    expect(asked.status).toBe(201);
    const askedBundle = asked.body as ReviewBundle;
    expect(askedBundle.clarifications[0]).toMatchObject({
      status: 'open',
      responseDueAt: '2026-10-08T23:59:59+03:00',
      extensionRequired: false,
      overdue: false,
    });
    expect(askedBundle.item.state).toBe('clarification_requested');

    // The institution revises only M-01 by adding a new file; the rest is unchanged.
    const reportPath = obligationPath('DEMO-001');
    const bundle = await focal.json<ReportBundle>(`${reportPath}/report`);
    expect(bundle.editable).toBe(true);
    expect(bundle.clarifications[0]?.items[0]?.criterion).toMatch(/^M-01/);
    const extra = (
      await focal.upload(
        `${reportPath}/evidence`,
        { name: 'exception-review.pdf', bytes: pdf('exception review') },
        { category: 'other' },
      )
    ).body as EvidenceItem;
    const answers = structuredClone(bundle.draft!.answers);
    answers.milestones['DEMO-001:M-01']!.evidence.push({
      evidenceId: extra.id,
      passage: 'Page 1',
    });
    const draft = (
      await focal.put(`${reportPath}/draft`, {
        baseVersion: bundle.draft!.version,
        answers,
      })
    ).body as Draft;
    const receipt: Receipt = await submitDraft(
      focal,
      'DEMO-001',
      draft.version,
    );
    expect(receipt.revision).toBe(2);
    const after = await focal.json<ReportBundle>(`${reportPath}/report`);
    expect(after.receipts.map((row) => row.revision)).toEqual([1, 2]);
    expect(after.clarifications[0]).toMatchObject({
      status: 'responded',
      response: { revision: 2 },
    });

    const [current] = await officer.json<ReviewQueueItem[]>('/reviews');
    expect(current).toMatchObject({
      revision: 2,
      state: 'submitted',
      decisionsRecorded: 0,
    });
    expect(current!.flags).toContain('needs_re_review');
    const revisedPath = `/reviews/${current!.submissionId}`;
    const revised = await officer.json<ReviewBundle>(revisedPath);
    expect(revised.prior?.changes).toEqual({
      'DEMO-001:M-01': 'changed',
      'DEMO-001:M-02': 'unchanged',
      'DEMO-001:M-03': 'unchanged',
      'DEMO-001:M-04': 'unchanged',
    });
    expect(revised.revisions.map((row) => row.revision)).toEqual([1, 2]);

    // An obsolete revision cannot be finalized or decided (AT10).
    expect(
      (await officer.post(`${path}/finalize`, { revision: 1 })).status,
    ).toBe(409);
    expect(
      await officer.post(`${revisedPath}/decisions/M-01/carry-forward`, {
        revision: 2,
      }),
    ).toMatchObject({ status: 409, body: { code: 'dependency_changed' } });
    const carried = (
      await officer.post(`${revisedPath}/decisions/M-02/carry-forward`, {
        revision: 2,
      })
    ).body as ReviewBundle;
    expect(
      carried.decisions.find(
        (decision) => decision.milestoneId === 'DEMO-001:M-02',
      )?.carriedForwardFrom,
    ).toBe(
      revised.prior?.decisions.find(
        (decision) => decision.milestoneId === 'DEMO-001:M-02',
      )?.id,
    );
    // Historical decisions for revision 1 remain intact.
    expect(
      carried.history.filter((decision) => decision.revision === 1),
    ).toHaveLength(4);
  });

  it('reopens a finalized review with a reason and keeps decision history (PRD §7.4)', async () => {
    const { officer, item, path } = await submittedQ1();
    await passSuitability(officer, item.submissionId);
    await decideAll(officer, item.submissionId, 1);
    await confirmSeed('DEMO-001');
    await officer.post(`${path}/finalize`, { revision: 1 });
    expect(
      (await officer.post(`${path}/reopen`, { reason: 'short' })).status,
    ).toBe(422);
    const reopened = (
      await officer.post(`${path}/reopen`, {
        reason: 'Later evidence suggests M-01 was not completed.',
      })
    ).body as ReviewBundle;
    expect(reopened).toMatchObject({
      finalizedAt: null,
      canDecide: true,
      item: { state: 'under_review' },
    });
    expect(reopened.reopenings).toHaveLength(1);
    await officer.put(`${path}/decisions/M-01`, {
      outcome: 'rejected',
      reason: 'Exception review not evidenced.',
      revision: 1,
    });
    const final = await officer.json<ReviewBundle>(path);
    expect(
      final.history.filter(
        (decision) => decision.milestoneId === 'DEMO-001:M-01',
      ),
    ).toHaveLength(2);
    expect(final.score.reviewed).toMatchObject({ points: '45.00' });
  });

  it('lets the supervisor read and comment without deciding (PRD §5.2, §7.3)', async () => {
    const { officer, path } = await submittedQ1('DEMO-005', 'officer-b');
    const supervisor = await api.client().signIn('supervisor');
    const commented = await supervisor.post(`${path}/comments`, {
      text: 'Please check the minutes cover the Q1 training.',
    });
    expect(commented.status).toBe(200);
    expect((commented.body as ReviewBundle).comments).toHaveLength(1);
    expect(
      (
        await supervisor.put(`${path}/decisions/M-05`, {
          outcome: 'accepted',
          reason: '',
          revision: 1,
        })
      ).status,
    ).toBe(403);
    // Officers read comments but cannot add them.
    expect(
      (await officer.json<ReviewBundle>(path)).comments[0]?.text,
    ).toContain('Q1 training');
    expect(
      (
        await officer.post(`${path}/comments`, {
          text: 'Officers cannot post oversight comments.',
        })
      ).status,
    ).toBe(403);
  });

  it('closes an unanswered clarification only after the window and the cutoff (AT29)', async () => {
    const { officer, path } = await submittedQ1();
    await setBusinessTime('2027-07-29T10:00:00+03:00');
    const asked = (
      await officer.post(`${path}/clarifications`, {
        revision: 1,
        items: [
          {
            milestoneCode: null,
            question: 'Please explain the gaps in the minutes.',
            requestedEvidence: '',
          },
        ],
      })
    ).body as ReviewBundle;
    const open = asked.clarifications[0]!;
    expect(open).toMatchObject({
      responseDueAt: '2027-08-05T23:59:59+03:00',
      extensionRequired: true,
    });
    const close = () =>
      officer.post(`${path}/clarifications/${open.id}/close`, {
        reason: 'No response by the end of the window.',
      });
    await setBusinessTime('2027-08-01T09:00:00+03:00');
    expect(await close()).toMatchObject({
      status: 409,
      body: { code: 'window_open' },
    });
    await setBusinessTime('2027-08-06T09:00:00+03:00');
    const closed = (await close()).body as ReviewBundle;
    expect(closed.clarifications[0]).toMatchObject({
      status: 'closed_unanswered',
    });
    expect(closed.item.state).toBe('under_review');
  });

  it('lists only files in the caller’s scope, with filters (FR15)', async () => {
    const { officer } = await submittedQ1();
    const mine = await officer.json<EvidenceLookupItem[]>('/evidence');
    expect(mine.map((row) => row.evidence.fileName)).toEqual([
      'cpc-minutes.pdf',
    ]);
    expect(mine[0]).toMatchObject({
      institutionId: 'DEMO-001',
      suitability: 'not_checked',
      reviewState: 'awaiting_review',
      citedBy: ['M-01', 'M-02', 'M-03', 'M-04'],
    });
    expect(
      await officer.json<EvidenceLookupItem[]>(
        '/evidence?category=iao_minutes',
      ),
    ).toEqual([]);
    const outsider = await api.client().signIn('officer-b');
    expect(await outsider.json<EvidenceLookupItem[]>('/evidence')).toEqual([]);
    const focal = await api.client().signIn('focal-demo-001');
    expect((await focal.request('/evidence')).status).toBe(403);
  });

  it('lets an administrator act only with a justification, recording every use (FR10)', async () => {
    const { path } = await submittedQ1();
    const admin: Client = await api.client().signIn('administrator');
    expect((await admin.json<ReviewBundle>(path)).canOverride).toBe(true);
    const reject = (headers?: Record<string, string>) =>
      admin.request(`${path}/decisions/M-01`, {
        method: 'PUT',
        body: JSON.stringify({
          outcome: 'rejected',
          reason: 'Minutes do not record the review.',
          revision: 1,
        }),
        headers,
      });
    expect((await reject()).status).toBe(403);
    expect((await reject({ 'X-Override-Reason': 'Officer away' })).status).toBe(
      422,
    );
    expect(
      (
        await reject({
          'X-Override-Reason':
            'Officer A is on unplanned leave until after the cutoff.',
        })
      ).status,
    ).toBe(200);
    const overrides = await api.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'review.override'));
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.summary).toMatch(/^decisions\/M-01: Officer A/);
  });
});
