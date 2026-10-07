import {
  exportColumns,
  exportPayloadSchema,
  parseCsv,
  type AnnualEvaluation,
  type AnnualOverview,
  type ConsolidatedReport,
  type Foundations,
  type InstitutionResults,
  type Oversight,
  type ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  decisions,
  foundationReviews,
  submissions,
  systemState,
} from '../database/schema';
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

    const report = await admin.json<ConsolidatedReport>('/annual/report');
    expect(report.released.map((result) => result.institutionId)).toEqual([
      'DEMO-008',
    ]);
    expect(report.unreleased).toHaveLength(7);
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

  it('exports cpi-export-2 rows that trace back to their source decisions (FR13, FR16, §12.3)', async () => {
    expect((await admin.post('/simulation/scenario')).status).toBe(200);
    expect(
      (await admin.post('/annual/publish', { institutionIds: ['DEMO-001'] }))
        .status,
    ).toBe(200);
    const json = await admin.request('/annual/report.json');
    expect(json.headers.get('content-disposition')).toBe(
      'attachment; filename="cpi-consolidated-results.json"',
    );
    const payload = exportPayloadSchema.parse(json.body);
    const rows = payload.rows.filter(
      (row) => row.institution_id === 'DEMO-001',
    );
    expect(rows[0]).toMatchObject({
      indicator_id: 'annual_total',
      release_status: 'released',
      maximum_points: '100.00',
      earned_points: '88.75',
      simulation: true,
      scoring_profile_version: 1,
      publication_version: 1,
    });

    // Follow the Q1 row back to the persisted decisions and submission (FR16).
    const q1 = rows.find((row) => row.period_id === 'FY2026-27-Q1')!;
    const traced = await api.db
      .select()
      .from(decisions)
      .where(inArray(decisions.id, q1.decision_ids));
    expect(traced.length).toBeGreaterThan(0);
    expect(traced).toHaveLength(q1.decision_ids.length);
    expect(
      traced.every(
        (decision) =>
          decision.submissionId === q1.submission_id &&
          decision.supersededAt === null,
      ),
    ).toBe(true);
    const accepted = traced.filter((d) => d.outcome === 'accepted').length;
    expect(q1.rule_explanation).toContain(
      `${accepted}/${traced.length} milestones accepted`,
    );
    const [submission] = await api.db
      .select()
      .from(submissions)
      .where(eq(submissions.id, q1.submission_id!));
    expect(submission).toMatchObject({
      revision: q1.submission_revision,
      formVersionId: q1.form_version,
    });
    expect(q1.reviewer_ref).toMatch(/^officer-/);
    const procedures = rows.find((row) => row.indicator_id === 'procedures')!;
    const [review] = await api.db
      .select()
      .from(foundationReviews)
      .where(eq(foundationReviews.id, Number(procedures.decision_ids[0])));
    expect(review).toMatchObject({
      institutionId: 'DEMO-001',
      kind: 'procedures',
    });

    // Unreleased institutions carry reasons and no numbers (AT18).
    const unreleased = payload.rows.filter(
      (row) => row.release_status === 'unreleased',
    );
    expect(unreleased).toHaveLength(7);
    expect(unreleased.every((row) => row.earned_points === null)).toBe(true);

    // The CSV carries the same rows, column for column.
    const csv = parseCsv(
      String((await admin.request('/annual/report.csv')).body),
    );
    expect(csv[0]).toEqual(exportColumns);
    expect(csv).toHaveLength(payload.rows.length + 1);
    expect(
      await api.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'export.download')),
    ).toHaveLength(2);

    // An institution exports only its own released result (AT19).
    const focal = await api.client().signIn('focal-demo-001');
    const own = exportPayloadSchema.parse(
      (await focal.request('/results/export.json')).body,
    );
    expect(own.rows.every((row) => row.institution_id === 'DEMO-001')).toBe(
      true,
    );
    const other = await api.client().signIn('focal-demo-002');
    expect((await other.request('/results/export.json')).status).toBe(404);
  }, 120_000);
});
