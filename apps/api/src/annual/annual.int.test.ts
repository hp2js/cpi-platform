import type {
  AnnualEvaluation,
  AnnualOverview,
  ConsolidatedReport,
  Foundations,
  InstitutionResults,
  Oversight,
  ReportBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditEvents, systemState } from '../database/schema';
import { integration, startApi, type Client } from '../test/api';
import { completeDraft, publishSeedForm, submitDraft } from '../test/journeys';

/** Ported from apps/web/src/mocks/acceptance.test.ts and annual.test.ts (AT14, AT15, AT18–AT20). */
describe.skipIf(!integration)('annual evaluation and publication', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  let admin: Client;
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());
  beforeEach(async () => {
    await api.reset();
    admin = await api.client().signIn('administrator');
  });

  const afterCutoff = () =>
    api.db
      .update(systemState)
      .set({ businessTime: '2027-08-01T09:00:00+03:00' });
  const demo = (overview: AnnualOverview, id: string) =>
    overview.institutions.find((row) => row.institutionId === id)!;

  /** DEMO-008: every quarter closed as non-response, every foundation fully met. */
  async function readyDemo8() {
    await afterCutoff();
    const officer = await api.client().signIn('officer-b');
    for (const quarter of [1, 2, 3, 4]) {
      const result = await officer.post(
        `/obligations/${encodeURIComponent(`DEMO-008:FY2026-27-Q${quarter}`)}/close-nonresponse`,
        { reason: 'No report was received for this quarter.' },
      );
      expect(result.status).toBe(200);
    }
    const foundations = await officer.json<Foundations>(
      '/institutions/DEMO-008/foundations',
    );
    const pass = { outcome: 'pass', passage: 'Section 1', reason: '' };
    for (const indicator of foundations.indicators)
      await officer.put(
        `/institutions/DEMO-008/foundations/${indicator.kind}/review`,
        {
          versionId: indicator.versions[0]!.id,
          checks: [pass, pass, pass, pass],
        },
      );
    return officer;
  }

  it('blocks publication while a quarter awaits officer review (AT14)', async () => {
    await publishSeedForm(admin);
    const focal = await api.client().signIn('focal-demo-001');
    const { draft } = await completeDraft(focal, 'DEMO-001');
    await submitDraft(focal, 'DEMO-001', draft.version);
    await afterCutoff();
    const annual = await admin.json<AnnualOverview>('/annual');
    expect(annual.cutoffPassed).toBe(true);
    const demo1 = demo(annual, 'DEMO-001');
    expect(demo1.releasable).toBe(false);
    expect(demo1.quarters[0]!.status).toBe('awaiting_review');
    expect(demo1.total).toMatchObject({ status: 'pending' });
    expect(
      await admin.post('/annual/publish', { institutionIds: ['DEMO-001'] }),
    ).toMatchObject({ status: 422, body: { code: 'not_releasable' } });
  });

  it('tells the institution what was recorded for a quarter closed without submission (HP2-47)', async () => {
    await readyDemo8();
    const focal = await api.client().signIn('focal-demo-008');
    const report = () =>
      focal.json<ReportBundle>(
        `/obligations/${encodeURIComponent('DEMO-008:FY2026-27-Q1')}/report`,
      );
    expect(await report()).toMatchObject({
      editable: false,
      resultPublished: false,
      closure: {
        reason: 'No report was received for this quarter.',
        by: 'Prevention Officer B',
        at: '2027-08-01T09:00:00+03:00',
      },
    });
    await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] });
    expect((await report()).resultPublished).toBe(true);
  });

  it('publishes only after the cutoff', async () => {
    expect(
      await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] }),
    ).toMatchObject({ status: 409, body: { code: 'cutoff_not_passed' } });
    const officer = await api.client().signIn('officer-b');
    expect(
      await officer.post(
        `/obligations/${encodeURIComponent('DEMO-008:FY2026-27-Q1')}/close-nonresponse`,
        { reason: 'No report was received for this quarter.' },
      ),
    ).toMatchObject({ status: 409, body: { code: 'cutoff_not_passed' } });
  });

  it('downloads published reports as documents, in scope, audited (HP2-64)', async () => {
    await readyDemo8();
    const focal = await api.client().signIn('focal-demo-008');
    expect(
      (await focal.request('/publications/pub-0001/report.pdf')).status,
    ).toBe(404); // Nothing before publication (AT18).
    await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] });
    const { results } = await focal.json<InstitutionResults>('/results');
    const download = await focal.request(
      `/publications/${results[0]!.id}/report.pdf`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    expect(download.headers.get('content-disposition')).toBe(
      'attachment; filename="CPI-FY2026-27-DEMO-008-v1.pdf"',
    );
    expect(String(download.body).startsWith('%PDF-1.7')).toBe(true);
    // Another institution's report is not found for this institution.
    const other = await api.client().signIn('focal-demo-001');
    expect(
      (await other.request(`/publications/${results[0]!.id}/report.pdf`))
        .status,
    ).toBe(404);
    const supervisor = await api.client().signIn('supervisor');
    const consolidatedPdf = await supervisor.request('/annual/report.pdf');
    expect(consolidatedPdf.status).toBe(200);
    expect(consolidatedPdf.headers.get('content-disposition')).toMatch(
      /filename="CPI-FY2026-27-consolidated-batch-\d+\.pdf"/,
    );
    expect((await focal.request('/annual/report.pdf')).status).toBe(403);
    const audits = await api.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'report.download'));
    expect(audits.map((event) => event.summary)).toEqual(
      expect.arrayContaining([
        'Downloaded CPI-FY2026-27-DEMO-008-v1.pdf',
        expect.stringMatching(/^Downloaded CPI-FY2026-27-consolidated-batch-/),
      ]),
    );
  });

  it('releases a result, withholds numbers before release, and corrects through a case (AT15, AT18–AT20)', async () => {
    // Before release the institution sees no numbers (AT18).
    const focal = await api.client().signIn('focal-demo-008');
    const before = await focal.json<InstitutionResults>('/results');
    expect(before).toMatchObject({ released: false, results: [] });
    expect((await focal.request('/results/export.csv')).status).toBe(404);

    await readyDemo8();
    const ready = demo(await admin.json<AnnualOverview>('/annual'), 'DEMO-008');
    expect(ready.quarters.map((quarter) => quarter.status)).toEqual([
      'closed_without_submission',
      'closed_without_submission',
      'closed_without_submission',
      'closed_without_submission',
    ]);
    // An explicit zero disposition, never a silent one (AT15).
    expect(ready.total).toMatchObject({
      status: 'calculated',
      points: '40.00',
      foundationPoints: '40.00',
      implementationPoints: '0.00',
    });
    expect(ready.releasable).toBe(true);

    const published = (
      await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] })
    ).body as AnnualOverview;
    expect(demo(published, 'DEMO-008').publication).toMatchObject({
      version: 1,
      points: '40.00',
      stale: false,
    });
    expect(
      await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] }),
    ).toMatchObject({ status: 409, body: { code: 'already_published' } });

    const released = await focal.json<InstitutionResults>('/results');
    expect(released.released).toBe(true);
    expect(released.results[0]).toMatchObject({
      version: 1,
      status: 'current',
      profileName: 'Hackathon Mock v1',
      evaluation: { total: { points: '40.00' } },
    });
    const csv = await focal.request('/results/export.csv');
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toBe(
      'attachment; filename="cpi-result-DEMO-008.csv"',
    );
    expect(String(csv.body).split('\r\n')[0]).toMatch(/^schema_version,/);
    expect(String(csv.body)).toContain('DEMO-008');
    // Exports never carry another institution's rows, and are not for officers.
    expect(String(csv.body)).not.toMatch(/DEMO-00[1-7]/);
    const officer = await api.client().signIn('officer-b');
    expect((await officer.request('/annual/report.csv')).status).toBe(403);
    expect((await officer.request('/results/export.csv')).status).toBe(403);

    // A correction case lets the administrator publish a new version; v1 stays as superseded (AT20).
    expect(
      await admin.post('/annual/corrections', {
        institutionId: 'DEMO-001',
        periodId: 'FY2026-27-Q1',
        reason: 'Nothing has been published for this one.',
      }),
    ).toMatchObject({ status: 409, body: { code: 'not_published' } });
    const opened = await admin.post('/annual/corrections', {
      institutionId: 'DEMO-008',
      periodId: 'FY2026-27-Q2',
      reason: 'The Q2 closure reason needs restating.',
    });
    expect(opened.status).toBe(201);
    expect(
      demo(opened.body as AnnualOverview, 'DEMO-008').correction,
    ).toMatchObject({ periodId: 'FY2026-27-Q2' });
    await admin.post('/annual/publish', { institutionIds: ['DEMO-008'] });
    const history = await focal.json<InstitutionResults>('/results');
    expect(
      history.results.map((result) => [result.version, result.status]),
    ).toEqual([
      [2, 'current'],
      [1, 'superseded'],
    ]);
    expect(history.results[0]!.correctionReason).toBe(
      'The Q2 closure reason needs restating.',
    );

    // Staff read every version in full too, within their scope (HP2-68).
    const supervisor = await api.client().signIn('supervisor');
    const staffView = await supervisor.json<InstitutionResults>(
      '/institutions/DEMO-008/results',
    );
    expect(
      staffView.results.map((result) => [result.version, result.status]),
    ).toEqual([
      [2, 'current'],
      [1, 'superseded'],
    ]);
    expect(staffView.results[1]!.evaluation.quarters).toHaveLength(4);
    expect((await focal.request('/institutions/DEMO-008/results')).status).toBe(
      403,
    );

    const report = await admin.json<ConsolidatedReport>('/annual/report');
    expect(report.released.map((result) => result.institutionId)).toEqual([
      'DEMO-008',
    ]);
    expect(report.unreleased).toHaveLength(7);

    // The year at a glance (HP2-66): every institution, coverage, batches and corrections.
    expect(report.summary.map((row) => row.institutionId)).toEqual([
      'DEMO-001',
      'DEMO-002',
      'DEMO-003',
      'DEMO-004',
      'DEMO-005',
      'DEMO-006',
      'DEMO-007',
      'DEMO-008',
    ]);
    expect(report.summary.at(-1)).toMatchObject({
      released: true,
      version: 2,
      points: '40.00',
      lateQuarters: 0,
    });
    expect(report.summary[0]).toMatchObject({ released: false, points: null });
    expect(report.batches).toHaveLength(2);
    expect(report.corrections).toEqual([
      expect.objectContaining({
        institutionId: 'DEMO-008',
        fromVersion: 1,
        toVersion: 2,
        reason: 'The Q2 closure reason needs restating.',
      }),
    ]);
    expect(
      report.coverage.find((metric) => metric.id === 'release-coverage'),
    ).toMatchObject({ numerator: 1, denominator: 8 });
    expect(
      report.coverage.find((metric) => metric.id === 'closed-nonresponse'),
    ).toMatchObject({ numerator: 4, denominator: 32 });
  });

  it('records extensions after the cutoff that hold release until they end (AT29)', async () => {
    const extend = (untilDate: string) =>
      admin.post('/annual/extensions', {
        institutionId: 'DEMO-001',
        untilDate,
        reason: 'Clarification raised close to the cutoff.',
        authorizedBy: 'Head of Prevention (fictional)',
      });
    expect(await extend('2027-07-20')).toMatchObject({
      status: 422,
      body: { fieldErrors: { untilDate: expect.any(String) } },
    });
    const granted = (await extend('2027-08-10')).body as AnnualEvaluation;
    expect(granted.extension).toMatchObject({
      until: '2027-08-10T23:59:59+03:00',
      recordedBy: 'Administrator',
    });
    // Release waits until the extension ends.
    expect(granted.holds).toEqual([
      'Evaluation extended to 2027-08-10: release waits until the extension ends.',
    ]);
    await api.db
      .update(systemState)
      .set({ businessTime: '2027-08-11T09:00:00+03:00' });
    expect(
      demo(await admin.json<AnnualOverview>('/annual'), 'DEMO-001').holds,
    ).toEqual([]);
  });

  it('shows the oversight dashboard within scope', async () => {
    await readyDemo8();
    const supervisor = await api.client().signIn('supervisor');
    const view = await supervisor.json<Oversight>(
      '/oversight?institutionId=DEMO-008',
    );
    expect(view.backlog).toEqual({
      awaitingOfficer: 0,
      awaitingInstitution: 0,
      closedNonresponse: 4,
    });
    expect(
      view.metrics.find((row) => row.id === 'submission-coverage'),
    ).toMatchObject({ numerator: 0, denominator: 4 });
    const officer = await api.client().signIn('officer-a');
    // Officers see the dashboard for their own portfolio only.
    const own = await officer.json<Oversight>('/oversight');
    expect(own.workload.map((row) => row.officerId)).toEqual(['officer-a']);
    // Officers see the annual view for their own institutions only.
    expect(
      (await officer.json<AnnualOverview>('/annual')).institutions.map(
        (row) => row.institutionId,
      ),
    ).toEqual(['DEMO-001', 'DEMO-002', 'DEMO-003', 'DEMO-004']);
    expect((await officer.json<ReviewQueueItem[]>('/reviews')).length).toBe(0);
  });
});
