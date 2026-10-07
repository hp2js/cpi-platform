import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import type {
  Draft,
  Plan,
  ReportAnswers,
  ReviewBundle,
  ReviewQueueItem,
} from '@cpi/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integration, startApi, type Client } from '../test/api';
import {
  attestation,
  completeDraft,
  obligationPath,
  passSuitability,
  publishSeedForm,
} from '../test/journeys';

/*
 * PRD §4.2 demonstration target: p95 under 2 s at 20 concurrent users for ordinary reads and
 * writes, excluding upload transfer. Runs the compiled API against its own `_test` database
 * (never the demo database) with `pnpm --filter @cpi/api test:load`.
 *
 * Each round restores the fixtures and keeps 20 users busy: 8 institution users save drafts and
 * submit while 12 others read queues, dashboards and the annual evaluation; then 8 officer users
 * record decisions and finalize while the same 12 keep reading.
 */
const load = integration && process.env.LOAD === '1';
const ROUNDS = Number(process.env.LOAD_ROUNDS ?? 5);
const SAVES = Number(process.env.LOAD_SAVES ?? 5);
const institutions = Array.from({ length: 8 }, (_, i) => `DEMO-00${i + 1}`);

type Sample = { journey: string; ms: number; ok: boolean };
/** The first failure of each journey, so an error rate always comes with its cause. */
const firstErrors: Record<string, string> = {};

describe.skipIf(!load)('load: 20 concurrent users (PRD §4.2)', () => {
  let api: Awaited<ReturnType<typeof startApi>>;
  const samples: Sample[] = [];
  beforeAll(async () => {
    api = await startApi();
  }, 60_000);
  afterAll(() => api?.stop());

  /** Times one request; any status of 400 or more counts as an error. */
  async function timed<T>(
    journey: string,
    call: () => Promise<{ status: number; body: unknown }>,
  ) {
    const start = performance.now();
    const result = await call().catch(() => ({ status: 0, body: null }));
    const ok = result.status > 0 && result.status < 400;
    samples.push({ journey, ms: performance.now() - start, ok });
    if (!ok)
      firstErrors[journey] ??=
        `${result.status} ${JSON.stringify(result.body)}`;
    return result.body as T;
  }

  /** The 12 readers: officer queue, supervisor dashboards with filters, annual evaluation. */
  async function readers(signal: { done: boolean }) {
    const users = [
      ...['officer-a', 'officer-b', 'officer-a', 'officer-b'].map((id) => ({
        id,
        run: (c: Client) =>
          timed('officer: queue', () => c.request('/reviews?status=open')),
      })),
      ...[0, 1, 2, 3].map((n) => ({
        id: 'supervisor',
        run: (c: Client) =>
          timed('supervisor: dashboards and filters', () =>
            c.request(
              [
                '/oversight',
                '/oversight?periodId=FY2026-27-Q1',
                `/oversight?institutionId=${institutions[n]}`,
                '/oversight?officerId=officer-a',
              ][n]!,
            ),
          ),
      })),
      ...[0, 1, 2, 3].map(() => ({
        id: 'administrator',
        run: (c: Client) =>
          timed('administrator: annual evaluation', () => c.request('/annual')),
      })),
    ];
    await Promise.all(
      users.map(async (user) => {
        const client = await api.client().signIn(user.id);
        while (!signal.done) await user.run(client);
      }),
    );
  }

  async function institutionUser(institutionId: string) {
    const focal = await api
      .client()
      .signIn(`focal-${institutionId.toLowerCase()}`);
    // The evidence upload is setup: upload transfer is outside the target.
    const { draft, answers } = await completeDraft(focal, institutionId);
    let version = draft.version;
    for (let save = 0; save < SAVES; save += 1) {
      const saved = await timed<Draft>('institution: draft save', () =>
        focal.put(`${obligationPath(institutionId)}/draft`, {
          baseVersion: version,
          answers: withRemark(answers, save),
        }),
      );
      version = saved?.version ?? version;
    }
    await timed('institution: submit', () =>
      focal.post(
        `${obligationPath(institutionId)}/submit`,
        { draftVersion: version, attestation },
        { 'Idempotency-Key': `load-${institutionId}-${version}` },
      ),
    );
  }

  async function officerUser(officerId: string, item: ReviewQueueItem) {
    const officer = await api.client().signIn(officerId);
    const path = `/reviews/${item.submissionId}`;
    await passSuitability(officer, item.submissionId);
    // Setup, as the officer does once per seeded baseline (AT25).
    const q1 = (
      await officer.json<Plan>(`/institutions/${item.institutionId}/plan`)
    ).baselines
      .filter((baseline) => baseline.periodId === 'FY2026-27-Q1')
      .at(-1)!;
    if (q1.historicalSeed && !q1.historicalSeed.confirmedAt)
      await officer.post(`/baselines/${q1.id}/confirm-seed`, {
        version: q1.version,
      });
    const bundle = await officer.json<ReviewBundle>(path);
    for (const milestone of bundle.milestones)
      await timed('officer: review decision', () =>
        officer.put(`${path}/decisions/${milestone.code}`, {
          outcome: 'accepted',
          reason: '',
          revision: bundle.item.revision,
        }),
      );
    await timed('officer: finalize', () =>
      officer.post(`${path}/finalize`, { revision: bundle.item.revision }),
    );
  }

  it(
    `${ROUNDS} rounds`,
    async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        await api.reset();
        await api.flushRedis();
        await publishSeedForm(await api.client().signIn('administrator'));

        const writing = { done: false };
        const reading = readers(writing);
        await Promise.all(institutions.map(institutionUser));
        const queues = await Promise.all(
          ['officer-a', 'officer-b'].map(async (id) => ({
            id,
            items: await (
              await api.client().signIn(id)
            ).json<ReviewQueueItem[]>('/reviews?status=open'),
          })),
        );
        await Promise.all(
          queues.flatMap(({ id, items }) =>
            items.map((item) => officerUser(id, item)),
          ),
        );
        writing.done = true;
        await reading;
      }

      const report = summarize(samples);
      const environment = {
        date: new Date().toISOString(),
        commit: execSync('git rev-parse --short HEAD').toString().trim(),
        cpu: `${os.cpus()[0]?.model} × ${os.cpus().length}`,
        memoryGb: Math.round(os.totalmem() / 2 ** 30),
        platform: `${os.platform()} ${os.release()}`,
        node: process.version,
        rounds: ROUNDS,
        draftSavesPerInstitution: SAVES,
      };
      console.log(JSON.stringify(environment, null, 2));
      console.table(report);
      if (process.env.LOAD_OUT)
        writeFileSync(
          process.env.LOAD_OUT,
          JSON.stringify({ environment, report, firstErrors }, null, 2),
        );
      // A failing request means the journey was not measured: the run fails with its cause.
      expect(firstErrors).toEqual({});
      // Every journey must have run.
      expect(report.map((row) => row.journey).sort()).toEqual(
        [
          'administrator: annual evaluation',
          'institution: draft save',
          'institution: submit',
          'officer: finalize',
          'officer: queue',
          'officer: review decision',
          'supervisor: dashboards and filters',
        ].sort(),
      );
    },
    30 * 60_000,
  );
});

const withRemark = (answers: ReportAnswers, save: number): ReportAnswers => ({
  ...answers,
  questions: { ...answers.questions, remarks: `Edit ${save + 1}.` },
});

/** p50/p95/p99 by nearest rank, the error rate, and whether p95 meets the 2 s target. */
export function summarize(samples: Sample[]) {
  const journeys = [...new Set(samples.map((sample) => sample.journey))];
  return journeys.sort().map((journey) => {
    const rows = samples.filter((sample) => sample.journey === journey);
    const ms = rows.map((row) => row.ms).sort((a, b) => a - b);
    const at = (p: number) =>
      Math.round(ms[Math.max(0, Math.ceil((p / 100) * ms.length) - 1)]!);
    const p95 = at(95);
    const errors = rows.filter((row) => !row.ok).length;
    return {
      journey,
      requests: rows.length,
      p50: at(50),
      p95,
      p99: at(99),
      errorRate: `${((100 * errors) / rows.length).toFixed(1)}%`,
      // Met only when measured under 2 s with no errors.
      target: p95 < 2000 && errors === 0 ? 'met' : 'NOT met',
    };
  });
}
