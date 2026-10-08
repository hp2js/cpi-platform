// @vitest-environment node
import {
  annualOverviewSchema,
  exportColumns,
  exportPayloadSchema,
  parseCsv,
  inboxSchema,
  institutionResultsSchema,
  oversightSchema,
  reviewBundleSchema,
  reviewQueueSchema,
  scenarioResultSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiUrl, request } from '@/lib/api';
import { signInAs } from '@/test/render-app';
import { getDb } from './db';

const expected: Record<string, string> = {
  'DEMO-001': '88.75', // Example A
  'DEMO-002': '100.00', // missing evidence corrected through clarification
  'DEMO-003': '100.00', // late, with no invented penalty (Example E)
  'DEMO-004': '96.25', // worked case §3.3
  'DEMO-005': '70.00', // Example B: Q3 closed, partial risk assessment
  'DEMO-006': '100.00', // amendment
  'DEMO-007': '100.00', // wrong-period evidence replaced
  'DEMO-008': '100.00', // reassigned
};

async function runYear() {
  await signInAs('administrator');
  // The whole year in one request, as the app allows for it (features/simulation).
  return request('/api/simulation/scenario', scenarioResultSchema, {
    method: 'POST',
    timeoutMs: 60_000,
  });
}

describe('scripted demonstration year (PRD §17)', () => {
  it(
    'reproduces every expected annual result and stays pending until publication',
    { timeout: 60_000 },
    async () => {
      const result = await runYear();
      expect(result.steps.length).toBeGreaterThan(20);
      const overview = await request('/api/annual', annualOverviewSchema);
      expect(overview.cutoffPassed).toBe(true);
      const totals = Object.fromEntries(
        overview.institutions.map((evaluation) => [
          evaluation.institutionId,
          evaluation.total.status === 'calculated'
            ? evaluation.total.points
            : evaluation.total.reasons.join('; '),
        ]),
      );
      expect(totals).toEqual(expected);

      const demo5 = overview.institutions.find(
        (evaluation) => evaluation.institutionId === 'DEMO-005',
      )!;
      expect(demo5.quarters.map((quarter) => quarter.status)).toEqual([
        'finalized',
        'finalized',
        'closed_without_submission',
        'finalized',
      ]);
      const demo3 = overview.institutions.find(
        (evaluation) => evaluation.institutionId === 'DEMO-003',
      )!;
      expect(demo3.quarters.map((quarter) => quarter.late)).toEqual([
        false,
        true,
        false,
        false,
      ]);
      const demo8 = overview.institutions.find(
        (evaluation) => evaluation.institutionId === 'DEMO-008',
      )!;
      expect(demo8.quarters.map((quarter) => quarter.reviewedBy)).toEqual([
        'Prevention Officer B',
        'Prevention Officer B',
        'Prevention Officer A',
        'Prevention Officer A',
      ]);

      // Nothing numerical reaches an institution before release (AT18).
      await signInAs('focal-demo-001');
      const before = await request('/api/results', institutionResultsSchema);
      expect(before).toMatchObject({ released: false, results: [] });
      await expect(request('/api/annual', z.unknown())).rejects.toMatchObject({
        status: 403,
      });

      // Publication of a ready batch (AT19); only the entity's own result is visible.
      await signInAs('administrator');
      await request('/api/annual/publish', annualOverviewSchema, {
        method: 'POST',
        json: { institutionIds: Object.keys(expected) },
      });
      await signInAs('focal-demo-004');
      const released = await request('/api/results', institutionResultsSchema);
      expect(released.results).toHaveLength(1);
      expect(released.results[0]).toMatchObject({
        institutionId: 'DEMO-004',
        status: 'current',
        version: 1,
        evaluation: { total: { points: '96.25' } },
      });
      expect(JSON.stringify(released)).not.toContain('DEMO-001');
    },
  );

  it(
    'corrects a published result through a case, preserving the superseded release (AT20)',
    { timeout: 60_000 },
    async () => {
      await runYear();
      await request('/api/annual/publish', annualOverviewSchema, {
        method: 'POST',
        json: { institutionIds: ['DEMO-008'] },
      });
      // Without a case the officer cannot reopen a published quarter.
      await signInAs('officer-a');
      const finalized = await request(
        '/api/reviews?status=finalized',
        reviewQueueSchema,
      );
      const q4 = finalized.find(
        (item) =>
          item.institutionId === 'DEMO-008' && item.periodLabel === 'Q4',
      )!;
      await expect(
        request(`/api/reviews/${q4.submissionId}/reopen`, z.unknown(), {
          method: 'POST',
          json: { reason: 'Correction needed for M-13.' },
        }),
      ).rejects.toMatchObject({
        status: 409,
        code: 'correction_required',
      });
      await signInAs('administrator');
      await request('/api/annual/corrections', annualOverviewSchema, {
        method: 'POST',
        json: {
          institutionId: 'DEMO-008',
          periodId: 'FY2026-27-Q4',
          reason: 'Later evidence shows the Q4 exception review was not done.',
        },
      });
      await signInAs('officer-a');
      await request(
        `/api/reviews/${q4.submissionId}/reopen`,
        reviewBundleSchema,
        {
          method: 'POST',
          json: { reason: 'Correction case: Q4 exception review not done.' },
        },
      );
      await request(
        `/api/reviews/${q4.submissionId}/decisions/M-13`,
        reviewBundleSchema,
        {
          method: 'PUT',
          json: {
            outcome: 'rejected',
            reason: 'Exception review was not completed in Q4.',
            revision: 1,
          },
        },
      );
      await request(
        `/api/reviews/${q4.submissionId}/finalize`,
        reviewBundleSchema,
        { method: 'POST', json: { revision: 1 } },
      );
      await signInAs('administrator');
      const after = await request('/api/annual/publish', annualOverviewSchema, {
        method: 'POST',
        json: { institutionIds: ['DEMO-008'] },
      });
      expect(
        after.institutions.find(
          (evaluation) => evaluation.institutionId === 'DEMO-008',
        )?.publication,
      ).toMatchObject({ version: 2, points: '96.25', stale: false }); // 40 + 60 × (1 + 1 + 1 + 0.75) ÷ 4
      await signInAs('focal-demo-008');
      const results = await request('/api/results', institutionResultsSchema);
      expect(
        results.results.map((result) => [result.version, result.status]),
      ).toEqual([
        [2, 'current'],
        [1, 'superseded'],
      ]);
      expect(results.results[0]?.correctionReason).toMatch(/exception review/);
    },
  );

  it(
    'exports cpi-export-2 rows that trace back to their source decisions (FR13, FR16, §12.3)',
    { timeout: 60_000 },
    async () => {
      await runYear();
      await request('/api/annual/publish', annualOverviewSchema, {
        method: 'POST',
        json: { institutionIds: ['DEMO-001'] },
      });
      const payload = await request(
        '/api/annual/report.json',
        exportPayloadSchema,
      );
      const rows = payload.rows.filter(
        (row) => row.institution_id === 'DEMO-001',
      );
      expect(rows.map((row) => row.indicator_id)).toEqual([
        'annual_total',
        'procedures',
        'risk_assessment',
        'mitigation_plan',
        'implementation',
        'implementation',
        'implementation',
        'implementation',
      ]);
      expect(rows[0]).toMatchObject({
        release_status: 'released',
        institution_name: expect.any(String),
        maximum_points: '100.00',
        earned_points: '88.75',
        simulation: true,
        scoring_profile_version: 1,
        publication_version: 1,
        missing_data_status: 'complete',
      });

      // Follow the Q1 row back to the decisions and submission it was scored from.
      const db = getDb();
      const q1 = rows.find((row) => row.period_id === 'FY2026-27-Q1')!;
      const decisions = db.decisions.filter((decision) =>
        q1.decision_ids.includes(decision.id),
      );
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions).toHaveLength(q1.decision_ids.length);
      expect(
        decisions.every(
          (decision) =>
            decision.submissionId === q1.submission_id &&
            decision.supersededAt === null,
        ),
      ).toBe(true);
      const accepted = decisions.filter(
        (decision) => decision.outcome === 'accepted',
      ).length;
      expect(q1.rule_explanation).toContain(
        `${accepted}/${decisions.length} milestones accepted`,
      );
      expect(
        db.submissions.find((submission) => submission.id === q1.submission_id),
      ).toMatchObject({
        revision: q1.submission_revision,
        formVersionId: q1.form_version,
      });
      expect(q1.reviewer_ref).toMatch(/^officer-/);
      expect(q1.reviewed_at_utc).toMatch(/Z$/);
      expect(typeof q1.late).toBe('boolean');
      const procedures = rows.find((row) => row.indicator_id === 'procedures')!;
      expect(
        db.foundationReviews.some(
          (review) => review.id === procedures.decision_ids[0],
        ),
      ).toBe(true);

      // Unreleased institutions are listed with their reasons and no numbers (AT18).
      const unreleased = payload.rows.filter(
        (row) => row.release_status === 'unreleased',
      );
      expect(unreleased.map((row) => row.institution_id)).toEqual([
        'DEMO-002',
        'DEMO-003',
        'DEMO-004',
        'DEMO-005',
        'DEMO-006',
        'DEMO-007',
        'DEMO-008',
      ]);
      expect(
        unreleased.every(
          (row) =>
            row.earned_points === null &&
            row.maximum_points === null &&
            row.rule_explanation.length > 0,
        ),
      ).toBe(true);

      // The CSV carries the same rows, column for column.
      const csv = parseCsv(
        await (await fetch(apiUrl('/api/annual/report.csv'))).text(),
      );
      expect(csv[0]).toEqual(exportColumns);
      expect(csv).toHaveLength(payload.rows.length + 1);
      expect(csv[1]![exportColumns.indexOf('earned_points')]).toBe('88.75');
      expect(
        db.audit.filter((event) => event.action === 'export.download'),
      ).toHaveLength(2);

      // An institution exports only its own released result (AT19).
      await signInAs('focal-demo-001');
      const own = await request(
        '/api/results/export.json',
        exportPayloadSchema,
      );
      expect(
        own.rows.every(
          (row) =>
            row.institution_id === 'DEMO-001' &&
            row.release_status === 'released',
        ),
      ).toBe(true);
      await signInAs('focal-demo-002');
      await expect(
        request('/api/results/export.json', z.unknown()),
      ).rejects.toMatchObject({ status: 404, code: 'not_published' });
    },
  );

  it('blocks publication before the cutoff and replays of clock boundaries create nothing new (AT13, AT19)', async () => {
    await signInAs('administrator');
    await expect(
      request('/api/annual/publish', z.unknown(), {
        method: 'POST',
        json: { institutionIds: ['DEMO-001'] },
      }),
    ).rejects.toMatchObject({ code: 'cutoff_not_passed' });
    const advance = (boundaryId: string) =>
      request('/api/simulation/advance', simulationStateSchema, {
        method: 'POST',
        json: { boundaryId },
      });
    await advance('Q2-overdue');
    const notifications = getDb().notifications.length;
    const processed = getDb().processedEvents.length;
    await advance('Q2-overdue');
    await advance('Q1-reminder-7');
    expect(getDb().notifications.length).toBe(notifications);
    expect(getDb().processedEvents.length).toBe(processed);
    await signInAs('focal-demo-001');
    const inbox = await request('/api/notifications', inboxSchema);
    expect(
      inbox.items
        .filter((item) => item.eventType === 'deadline.overdue')
        .map((item) => item.title),
    ).toEqual(['Q2 report overdue: DEMO-001', 'Q1 report overdue: DEMO-001']);
    // Each notice carries the time its boundary occurred and a link to the report.
    const q1 = inbox.items.find(
      (item) => item.title === 'Q1 report overdue: DEMO-001',
    );
    expect(q1).toMatchObject({
      createdAt: '2026-10-16T00:00:00+03:00',
      link: '/institution/reports/FY2026-27-Q1',
    });
  });

  it(
    'reports oversight metrics with explicit denominators (PRD §4.3)',
    { timeout: 60_000 },
    async () => {
      await runYear();
      await signInAs('supervisor');
      const oversight = await request('/api/oversight', oversightSchema);
      const byId = Object.fromEntries(
        oversight.metrics.map((metric) => [metric.id, metric]),
      );
      expect(byId['submission-coverage']).toMatchObject({
        numerator: 31,
        denominator: 32,
      });
      expect(byId['on-time']).toMatchObject({ numerator: 30, denominator: 32 });
      expect(byId['release-coverage']).toMatchObject({
        numerator: 0,
        denominator: 8,
        percent: 0,
      });
      expect(oversight.backlog.closedNonresponse).toBe(1);
      const filtered = await request(
        '/api/oversight?periodId=FY2026-27-Q3&officerId=officer-b',
        oversightSchema,
      );
      expect(
        filtered.metrics.find((metric) => metric.id === 'submission-coverage'),
      ).toMatchObject({ numerator: 2, denominator: 3 });
    },
  );
});
