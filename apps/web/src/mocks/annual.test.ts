// @vitest-environment node
import {
  annualOverviewSchema,
  inboxSchema,
  institutionResultsSchema,
  consolidatedReportSchema,
  oversightSchema,
  reportBundleSchema,
  reviewBundleSchema,
  reviewQueueSchema,
  scenarioResultSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { request } from '@/lib/api';
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

      // A closed quarter tells the institution what was recorded, not that it will open (HP2-47).
      await signInAs('focal-demo-005');
      const closedQ3 = () =>
        request(
          `/api/obligations/${encodeURIComponent('DEMO-005:FY2026-27-Q3')}/report`,
          reportBundleSchema,
        );
      const closed = await closedQ3();
      expect(closed).toMatchObject({
        editable: false,
        resultPublished: false,
        closure: { by: 'Prevention Officer B', reason: expect.any(String) },
      });

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
      // The consolidated summary shows the §17.1 results, by institution (HP2-66).
      const report = await request(
        '/api/annual/report',
        consolidatedReportSchema,
      );
      expect(
        Object.fromEntries(
          report.summary.map((row) => [row.institutionId, row.points]),
        ),
      ).toEqual(expected);
      expect(report.batches).toEqual([
        expect.objectContaining({ institutions: 8 }),
      ]);
      expect(report.corrections).toEqual([]);
      expect(
        report.coverage.find((metric) => metric.id === 'release-coverage'),
      ).toMatchObject({ numerator: 8, denominator: 8 });
      expect(
        report.summary.find((row) => row.institutionId === 'DEMO-003')
          ?.lateQuarters,
      ).toBe(1);

      await signInAs('focal-demo-005');
      expect((await closedQ3()).resultPublished).toBe(true);
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
