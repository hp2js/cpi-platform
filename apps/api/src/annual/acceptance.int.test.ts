import type {
  AnnualOverview,
  Draft,
  EvidenceItem,
  FormVersion,
  Foundations,
  ReportBundle,
  ReviewBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { systemState, periods } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import {
  attestation,
  completeDraft,
  decideAll,
  obligationPath,
  passSuitability,
  pdf,
  publishSeedForm,
  submitDraft,
} from '../test/journeys';

describe.skipIf(!integration)('remaining acceptance scenarios', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  let focal: Client;
  let officer: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    admin = await api.client().signIn('administrator');
    focal = await api.client().signIn('focal-demo-001');
    officer = await api.client().signIn('officer-a');
    await publishSeedForm(admin);
  });
  const clock = (businessTime: string) =>
    api.db.update(systemState).set({ businessTime });
  const row = async () =>
    (await admin.json<AnnualOverview>('/annual')).institutions.find(
      (r) => r.institutionId === 'DEMO-001',
    )!;
  const review = async () => {
    const [item] = await officer.json<ReviewQueueItem[]>('/reviews');
    return `/reviews/${item!.submissionId}`;
  };

  it('rejects cross-institution reads, downloads and exports without evidence metadata (AT01, AT02)', async () => {
    const { draft, upload } = await completeDraft(focal, 'DEMO-001');
    const receipt = await submitDraft(focal, 'DEMO-001', draft.version);
    const reviewPath = await review();
    for (const account of ['focal-demo-005', 'officer-b']) {
      const outsider = await api.client().signIn(account);
      for (const path of [
        '/institutions/DEMO-001/plan',
        '/institutions/DEMO-001/foundations',
        `${obligationPath('DEMO-001')}/report`,
        `/receipts/${receipt.id}`,
        `/evidence/${upload.id}/file`,
        reviewPath,
        '/annual/report.csv',
      ]) {
        const response = await outsider.request(path);
        expect([403, 404]).toContain(response.status);
        expect(JSON.stringify(response.body)).not.toContain(upload.fileName);
        expect(
          Object.keys(response.body as object).every((key) =>
            ['message', 'code', 'requestId', 'fieldErrors'].includes(key),
          ),
        ).toBe(true);
      }
      if (account === 'officer-b') {
        const queue = await outsider.json<ReviewQueueItem[]>('/reviews');
        expect(queue.some((item) => item.institutionId === 'DEMO-001')).toBe(
          false,
        );
      }
    }
  });

  it('publishes a new question and evidence requirement without changing a submitted snapshot (AT04, AT05)', async () => {
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    const path = await review();
    const before = await officer.json<ReviewBundle>(path);
    const form = (await admin.post('/forms')).body as FormVersion;
    const sections = structuredClone(form.sections);
    sections.at(-1)!.questions.push(
      {
        id: 'budget-note',
        label: 'Budget note',
        type: 'text',
        kind: 'informational',
        required: false,
      },
      {
        id: 'supporting-record',
        label: 'Supporting record',
        type: 'evidence',
        kind: 'informational',
        required: true,
        evidenceCategory: 'other',
      },
    );
    expect(
      (
        await admin.put(`/forms/${form.id}`, {
          title: form.title,
          periodIds: form.periodIds,
          sections,
          weights: form.weights,
          baseRevision: form.revision,
        })
      ).status,
    ).toBe(200);
    expect((await admin.post(`/forms/${form.id}/publish`)).status).toBe(200);
    const future = await focal.json<ReportBundle>(
      `${obligationPath('DEMO-001', 2)}/report`,
    );
    expect(future.form?.sections.flatMap((s) => s.questions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'budget-note' }),
        expect.objectContaining({
          id: 'supporting-record',
          required: true,
          evidenceCategory: 'other',
        }),
      ]),
    );
    const after = await officer.json<ReviewBundle>(path);
    expect(after.form.id).toBe(before.form.id);
    expect(after.form.sections).toEqual(before.form.sections);
    expect(after.form.weights).toEqual(before.form.weights);
    expect(after.answers).toEqual(before.answers);
    expect(after.score.provisional).toEqual(before.score.provisional);
  });

  it('receives declared missing milestone evidence without awarding affected credit (AT07)', async () => {
    const { draft, answers } = await completeDraft(focal, 'DEMO-001');
    answers.milestones['DEMO-001:M-01']!.evidence = [];
    answers.milestones['DEMO-001:M-01']!.evidenceUnavailable = {
      explanation: 'The exception review record is not available.',
    };
    const saved = (
      await focal.put(`${obligationPath('DEMO-001')}/draft`, {
        baseVersion: draft.version,
        answers,
      })
    ).body as Draft;
    const receipt = await submitDraft(focal, 'DEMO-001', saved.version);
    expect(receipt.evidenceComplete).toBe(false);
    const bundle = await officer.json<ReviewBundle>(await review());
    expect(
      bundle.answers.milestones['DEMO-001:M-01']!.evidenceUnavailable,
    ).toEqual(answers.milestones['DEMO-001:M-01']!.evidenceUnavailable);
    expect(bundle.score.provisional).toMatchObject({
      points: '45.00',
      fraction: { numerator: 3, denominator: 4 },
    });
    expect(
      (
        await officer.put(`${await review()}/decisions/M-01`, {
          revision: 1,
          outcome: 'accepted',
          reason: '',
        })
      ).status,
    ).toBe(422);
  });

  it('keeps Q3 awaiting review pending after the annual cutoff (AT14)', async () => {
    await clock('2027-04-01T08:00:00+03:00');
    const path = obligationPath('DEMO-001', 3);
    const bundle = await focal.json<ReportBundle>(`${path}/report`);
    const uploaded = (
      await focal.upload(
        `${path}/evidence`,
        { name: 'q3.pdf', bytes: pdf('Q3') },
        { category: 'cpc_minutes' },
      )
    ).body as EvidenceItem;
    const answers = {
      questions: {
        'cpc-minutes': { evidenceIds: [uploaded.id], unavailable: null },
        'iao-minutes': {
          evidenceIds: [],
          unavailable: { explanation: 'Awaiting signature.' },
        },
        'emerging-issues': 'None.',
        'actions-planned': 'Continue monitoring.',
        remarks: '',
      },
      milestones: Object.fromEntries(
        bundle.baseline.milestones.map((m) => [
          m.id,
          {
            completed: true,
            output: 'Completed.',
            emergingIssues: '',
            actions: '',
            evidence: [{ evidenceId: uploaded.id, passage: 'Page 1' }],
            evidenceUnavailable: null,
          },
        ]),
      ),
    };
    const saved = (
      await focal.put(`${path}/draft`, { baseVersion: 0, answers })
    ).body as Draft;
    expect(
      (
        await focal.post(
          `${path}/submit`,
          { draftVersion: saved.version, attestation },
          { 'Idempotency-Key': 'q3-pending' },
        )
      ).status,
    ).toBe(201);
    await clock('2027-08-01T09:00:00+03:00');
    const annual = await row();
    expect(annual.quarters[2]).toMatchObject({
      status: 'awaiting_review',
      implementation: null,
    });
    expect(annual.total.status).toBe('pending');
    expect(
      await admin.post('/annual/publish', { institutionIds: ['DEMO-001'] }),
    ).toMatchObject({ status: 422, body: { code: 'not_releasable' } });
  });

  it('invalidates both criteria using a replaced file and preserves unrelated history (AT27)', async () => {
    const { draft, upload, answers } = await completeDraft(focal, 'DEMO-001');
    const unrelated = (
      await focal.upload(
        `${obligationPath('DEMO-001')}/evidence`,
        { name: 'unrelated.pdf', bytes: pdf('unrelated') },
        { category: 'other' },
      )
    ).body as EvidenceItem;
    for (const code of ['M-03', 'M-04'])
      answers.milestones[`DEMO-001:${code}`]!.evidence = [
        { evidenceId: unrelated.id, passage: 'Page 1' },
      ];
    const saved = (
      await focal.put(`${obligationPath('DEMO-001')}/draft`, {
        baseVersion: draft.version,
        answers,
      })
    ).body as Draft;
    const receipt = await submitDraft(focal, 'DEMO-001', saved.version);
    const path = await review();
    const original = await officer.json<ReviewBundle>(path);
    await passSuitability(officer, original.item.submissionId);
    await decideAll(officer, original.item.submissionId, 1);
    expect(
      (
        await officer.post(`${path}/clarifications`, {
          revision: 1,
          items: [
            {
              milestoneCode: 'M-01',
              question: 'Please replace the shared minutes.',
              requestedEvidence: 'Corrected minutes',
            },
          ],
        })
      ).status,
    ).toBe(201);
    const replaced = await focal.upload(
      `${obligationPath('DEMO-001')}/evidence`,
      { name: 'corrected.pdf', bytes: pdf('corrected shared minutes') },
      { category: 'cpc_minutes', replaces: upload.id },
    );
    expect(replaced.status).toBe(201);
    const bundle = await focal.json<ReportBundle>(
      `${obligationPath('DEMO-001')}/report`,
    );
    const revisedAnswers = structuredClone(bundle.draft!.answers);
    const newFile = replaced.body as EvidenceItem;
    for (const milestone of Object.values(revisedAnswers.milestones))
      for (const reference of milestone.evidence)
        if (reference.evidenceId === upload.id)
          reference.evidenceId = newFile.id;
    const evidenceQuestion = revisedAnswers.questions['cpc-minutes'] as {
      evidenceIds: string[];
    };
    evidenceQuestion.evidenceIds = [newFile.id];
    const revisedDraft = (
      await focal.put(`${obligationPath('DEMO-001')}/draft`, {
        baseVersion: bundle.draft!.version,
        answers: revisedAnswers,
      })
    ).body as Draft;
    await submitDraft(
      focal,
      'DEMO-001',
      revisedDraft.version,
      'replacement-response',
    );
    const currentPath = await review();
    const current = await officer.json<ReviewBundle>(currentPath);
    expect(current.prior?.changes).toEqual({
      'DEMO-001:M-01': 'changed',
      'DEMO-001:M-02': 'changed',
      'DEMO-001:M-03': 'unchanged',
      'DEMO-001:M-04': 'unchanged',
    });
    expect(current.decisions).toHaveLength(0);
    for (const code of ['M-01', 'M-02'])
      expect(
        await officer.post(`${currentPath}/decisions/${code}/carry-forward`, {
          revision: 2,
        }),
      ).toMatchObject({ status: 409, body: { code: 'dependency_changed' } });
    const carried = (
      await officer.post(`${currentPath}/decisions/M-03/carry-forward`, {
        revision: 2,
      })
    ).body as ReviewBundle;
    expect(carried.decisions).toHaveLength(1);
    expect(carried.history.filter((d) => d.revision === 1)).toHaveLength(4);
    expect(
      (await officer.post(`${path}/finalize`, { revision: 1 })).status,
    ).toBe(409);
    expect((await focal.request(`/receipts/${receipt.id}`)).status).toBe(200);
    expect((await focal.request(`/evidence/${upload.id}/file`)).status).toBe(
      200,
    );
  });

  it('treats a timely post-cutoff clarification response as review backlog without changing deadlines (AT29)', async () => {
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    const path = await review();
    const deadlines = await api.db.select().from(periods);
    await clock('2027-07-29T10:00:00+03:00');
    const asked = (
      await officer.post(`${path}/clarifications`, {
        revision: 1,
        items: [
          {
            milestoneCode: null,
            question: 'Please clarify the report.',
            requestedEvidence: '',
          },
        ],
      })
    ).body as ReviewBundle;
    expect(asked.clarifications[0]!.responseDueAt).toBe(
      '2027-08-05T23:59:59+03:00',
    );
    await clock('2027-08-02T09:00:00+03:00');
    const bundle = await focal.json<ReportBundle>(
      `${obligationPath('DEMO-001')}/report`,
    );
    await submitDraft(
      focal,
      'DEMO-001',
      bundle.draft!.version,
      'clarification-response',
    );
    const annual = await row();
    expect(annual.quarters[0]!.status).toBe('awaiting_review');
    expect(annual.total.status).toBe('pending');
    expect(await api.db.select().from(periods)).toEqual(deadlines);
    expect(
      (
        await officer.post(
          `${path}/clarifications/${asked.clarifications[0]!.id}/close`,
          { reason: 'No response was received.' },
        )
      ).status,
    ).toBe(409);
  });

  it('uses the foundation version effective at cutoff, preserving historical evidence (AT28)', async () => {
    const initial = await officer.json<Foundations>(
      '/institutions/DEMO-001/foundations',
    );
    const risk = initial.indicators.find((i) => i.kind === 'risk_assessment')!;
    const original = risk.versions[0]!;
    const pass = { outcome: 'pass', passage: 'Section 2', reason: '' };
    expect(
      (
        await officer.put(
          '/institutions/DEMO-001/foundations/risk_assessment/review',
          { versionId: original.id, checks: [pass, pass, pass, pass] },
        )
      ).status,
    ).toBe(200);
    await clock('2027-08-01T09:00:00+03:00');
    const uploaded = await focal.upload(
      '/institutions/DEMO-001/foundations',
      { name: 'future.pdf', bytes: pdf('future assessment') },
      {
        kind: 'risk_assessment',
        approvalReference: 'Fictional future resolution',
        effectiveFrom: '2027-08-01',
        claimedChecks: '[true,true,true,true]',
      },
    );
    expect(uploaded.status).toBe(201);
    const successor = (
      await officer.json<Foundations>('/institutions/DEMO-001/foundations')
    ).indicators.find((i) => i.kind === 'risk_assessment')!.versions[0]!;
    const fail = {
      outcome: 'fail',
      passage: '',
      reason: 'Future assessment has no support.',
    };
    expect(
      (
        await officer.put(
          '/institutions/DEMO-001/foundations/risk_assessment/review',
          { versionId: successor.id, checks: [fail, fail, fail, fail] },
        )
      ).status,
    ).toBe(200);
    const outcome = (await row()).foundations.find(
      (f) => f.kind === 'risk_assessment',
    )!;
    expect(outcome).toMatchObject({
      versionId: original.id,
      score: { points: '15.00' },
    });
    expect(
      (await officer.request(`/evidence/${original.evidence.id}/file`)).status,
    ).toBe(200);
  });
  it('withdraws the current assessment without restoring prior credit or deleting its evidence (AT28)', async () => {
    const foundations = await officer.json<Foundations>(
      '/institutions/DEMO-001/foundations',
    );
    const original = foundations.indicators.find(
      (i) => i.kind === 'risk_assessment',
    )!.versions[0]!;
    const pass = { outcome: 'pass', passage: 'Section 2', reason: '' };
    await officer.put(
      '/institutions/DEMO-001/foundations/risk_assessment/review',
      { versionId: original.id, checks: [pass, pass, pass, pass] },
    );
    expect(
      (await row()).foundations.find((f) => f.kind === 'risk_assessment')!
        .score,
    ).toMatchObject({ points: '15.00' });
    expect(
      (
        await focal.post(`/foundation-versions/${original.id}/withdraw`, {
          reason:
            'The assessment is withdrawn because its supporting analysis is incomplete.',
        })
      ).status,
    ).toBe(200);
    expect(
      (await row()).foundations.find((f) => f.kind === 'risk_assessment')!.score
        .status,
    ).toBe('pending');
    expect(
      (await officer.request(`/evidence/${original.evidence.id}/file`)).status,
    ).toBe(200);
  });
});
