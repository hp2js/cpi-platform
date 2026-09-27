import { suitabilityCheckKeys } from '@cpi/contracts';
import type {
  Baseline,
  Foundations,
  Plan,
  ReportAnswers,
  ReportBundle,
  ReviewBundle,
  ReviewQueueItem,
  ScenarioResult,
} from '@cpi/contracts';
import { apiUrl } from '@/lib/api';
import { commit, getDb } from './db';
import { advanceTo } from './services/clock';
import { suppressLatency } from './services/latency';

/**
 * Scripted demonstration year (PRD §17.1–17.2). Every step acts as a real account through the
 * same mock API endpoints the screens use, so scope, workflow and audit rules all apply. Steps
 * already done (for example a quarter demonstrated live) are skipped.
 */

const ADMIN = 'administrator';
const focal = (institutionId: string) => `focal-${institutionId.toLowerCase()}`;
const officerOf = (institutionId: string) =>
  getDb().assignments.find(
    (assignment) =>
      assignment.institutionId === institutionId && assignment.validTo === null,
  )!.officerId;
const obligationId = (institutionId: string, quarter: number) =>
  `${institutionId}:FY2026-27-Q${quarter}`;
const institutions = [
  'DEMO-001',
  'DEMO-002',
  'DEMO-003',
  'DEMO-004',
  'DEMO-005',
  'DEMO-006',
  'DEMO-007',
  'DEMO-008',
];

const steps: ScenarioResult['steps'] = [];
function log(actor: string, summary: string) {
  steps.push({ at: getDb().businessTime, actor, summary });
}

async function call<T>(
  actor: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  commit((db) => {
    db.session = { userId: actor, expired: false };
  });
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isForm
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await response.text();
  const value = text
    ? (JSON.parse(text) as T & { message?: string })
    : (undefined as T);
  if (!response.ok)
    throw new Error(
      `${actor} ${method} ${path}: ${(value as { message?: string } | undefined)?.message ?? response.status}`,
    );
  return value;
}

function at(instant: string) {
  if (Date.parse(instant) > Date.parse(getDb().businessTime))
    commit((db) => advanceTo(db, instant));
}

function pdf(name: string, salt: string) {
  return new File(
    [
      new Uint8Array([
        0x25,
        0x50,
        0x44,
        0x46,
        0x2d,
        ...new TextEncoder().encode(salt),
      ]),
    ],
    name,
  );
}

async function upload(
  institutionId: string,
  quarter: number,
  name: string,
  category: string,
  replaces?: string,
) {
  const body = new FormData();
  body.append('file', pdf(name, `${institutionId}-${quarter}-${name}`));
  body.append('category', category);
  if (replaces) body.append('replaces', replaces);
  return call<{ id: string }>(
    focal(institutionId),
    'POST',
    `/api/obligations/${encodeURIComponent(obligationId(institutionId, quarter))}/evidence`,
    body,
  );
}

function claimAll(
  bundle: ReportBundle,
  cpc: string | null,
  iao: string | null,
): ReportAnswers {
  const unavailable = {
    explanation:
      'Signed minutes are not yet available from the committee secretary.',
  };
  return {
    questions: {
      'cpc-minutes': cpc
        ? { evidenceIds: [cpc], unavailable: null }
        : { evidenceIds: [], unavailable },
      'iao-minutes': iao
        ? { evidenceIds: [iao], unavailable: null }
        : { evidenceIds: [], unavailable },
      'emerging-issues': 'Staff turnover slowed some activities.',
      'actions-planned': 'Additional staff will be trained next quarter.',
      remarks: '',
    },
    milestones: Object.fromEntries(
      bundle.baseline.milestones.map((milestone) => {
        const file = milestone.title.includes('IAO') ? iao : cpc;
        return [
          milestone.id,
          {
            completed: true,
            output: `${milestone.code} completed as planned.`,
            emergingIssues: '',
            actions: '',
            evidence: file
              ? [{ evidenceId: file, passage: 'Minutes, item 4' }]
              : [],
            evidenceUnavailable: file ? null : unavailable,
          },
        ];
      }),
    ),
  };
}

async function submit(
  institutionId: string,
  quarter: number,
  options: { minutesUnavailable?: boolean; cpcName?: string } = {},
) {
  const obligation = getDb().obligations.find(
    (candidate) => candidate.id === obligationId(institutionId, quarter),
  )!;
  if (obligation.state !== 'not_started' && obligation.state !== 'draft')
    return;
  const actor = focal(institutionId);
  const path = `/api/obligations/${encodeURIComponent(obligation.id)}`;
  const cpc = options.minutesUnavailable
    ? null
    : (
        await upload(
          institutionId,
          quarter,
          options.cpcName ?? `cpc-minutes-q${quarter}.pdf`,
          'cpc_minutes',
        )
      ).id;
  const iao = options.minutesUnavailable
    ? null
    : (
        await upload(
          institutionId,
          quarter,
          `iao-minutes-q${quarter}.pdf`,
          'iao_minutes',
        )
      ).id;
  const bundle = await call<ReportBundle>(actor, 'GET', `${path}/report`);
  const draft = await call<{ version: number }>(actor, 'PUT', `${path}/draft`, {
    baseVersion: bundle.draft?.version ?? 0,
    answers: claimAll(bundle, cpc, iao),
  });
  await call(
    actor,
    'POST',
    `${path}/submit`,
    {
      draftVersion: draft.version,
      attestation: {
        authorized: true,
        submitterRole: 'Integrity Assurance Officer',
        approval: { kind: 'reference', reference: `CPC minutes Q${quarter}` },
      },
    },
    {
      'Idempotency-Key': `${getDb().runId}:${obligation.id}:${(obligation.currentRevision ?? 0) + 1}`,
    },
  );
  log(
    actor,
    `Submitted ${institutionId} Q${quarter}${options.minutesUnavailable ? ' with minutes declared unavailable' : ''}`,
  );
}

async function openReview(institutionId: string, quarter: number) {
  const officer = officerOf(institutionId);
  const queue = await call<ReviewQueueItem[]>(
    officer,
    'GET',
    '/api/reviews?status=open',
  );
  const item = queue.find(
    (candidate) =>
      candidate.obligationId === obligationId(institutionId, quarter),
  );
  return item
    ? {
        officer,
        bundle: await call<ReviewBundle>(
          officer,
          'GET',
          `/api/reviews/${item.submissionId}`,
        ),
      }
    : undefined;
}

async function confirmSeed(institutionId: string, officer: string) {
  const plan = await call<Plan>(
    officer,
    'GET',
    `/api/institutions/${institutionId}/plan`,
  );
  const q1 = plan.baselines
    .filter((baseline) => baseline.periodId.endsWith('Q1'))
    .at(-1)!;
  if (q1.historicalSeed && !q1.historicalSeed.confirmedAt)
    await call(officer, 'POST', `/api/baselines/${q1.id}/confirm-seed`, {
      version: q1.version,
    });
}

const allPass = Object.fromEntries(
  suitabilityCheckKeys.map((key) => [key, { outcome: 'pass', reason: '' }]),
);

/** Decide every milestone (carrying forward unchanged earlier decisions) and finalize. */
async function review(
  institutionId: string,
  quarter: number,
  rejects: Record<string, string> = {},
) {
  const open = await openReview(institutionId, quarter);
  if (!open) return;
  const { officer, bundle } = open;
  const path = `/api/reviews/${bundle.submissionId}`;
  // The officer checks each submitted file's suitability before relying on it (AT30).
  for (const item of bundle.evidence) {
    if (bundle.suitability.some((record) => record.evidenceId === item.id))
      continue;
    await call(officer, 'PUT', `${path}/evidence/${item.id}/suitability`, {
      revision: bundle.item.revision,
      checks: allPass,
    });
  }
  for (const milestone of bundle.milestones) {
    if (
      bundle.decisions.some((decision) => decision.milestoneId === milestone.id)
    )
      continue;
    const earlier = bundle.prior?.decisions.find(
      (decision) => decision.milestoneId === milestone.id,
    );
    const reason = rejects[milestone.code];
    if (
      earlier &&
      bundle.prior?.changes[milestone.id] === 'unchanged' &&
      !reason
    ) {
      await call(
        officer,
        'POST',
        `${path}/decisions/${milestone.code}/carry-forward`,
        { revision: bundle.item.revision },
      );
    } else {
      await call(officer, 'PUT', `${path}/decisions/${milestone.code}`, {
        outcome: reason ? 'rejected' : 'accepted',
        reason: reason ?? '',
        revision: bundle.item.revision,
      });
    }
  }
  if (quarter === 1) await confirmSeed(institutionId, officer);
  await call(officer, 'POST', `${path}/finalize`, {
    revision: bundle.item.revision,
  });
  log(
    officer,
    `Finalized ${institutionId} Q${quarter}${Object.keys(rejects).length ? ` with ${Object.keys(rejects).join(', ')} rejected` : ''}`,
  );
}

async function clarify(
  institutionId: string,
  quarter: number,
  question: string,
) {
  const open = await openReview(institutionId, quarter);
  if (!open || open.bundle.clarifications.length) return;
  await call(
    open.officer,
    'POST',
    `/api/reviews/${open.bundle.submissionId}/clarifications`,
    {
      revision: open.bundle.item.revision,
      items: [
        {
          milestoneCode: null,
          question,
          requestedEvidence: 'Signed minutes for the correct quarter',
        },
      ],
    },
  );
  log(
    open.officer,
    `Requested clarification from ${institutionId} Q${quarter}`,
  );
}

/** The institution answers a clarification with a revised submission. */
async function respond(
  institutionId: string,
  quarter: number,
  revise: (bundle: ReportBundle) => Promise<ReportAnswers>,
) {
  const obligation = getDb().obligations.find(
    (candidate) => candidate.id === obligationId(institutionId, quarter),
  )!;
  if (obligation.state !== 'clarification_requested') return;
  const actor = focal(institutionId);
  const path = `/api/obligations/${encodeURIComponent(obligation.id)}`;
  const bundle = await call<ReportBundle>(actor, 'GET', `${path}/report`);
  const answers = await revise(bundle);
  const draft = await call<{ version: number }>(actor, 'PUT', `${path}/draft`, {
    baseVersion: bundle.draft?.version ?? 0,
    answers,
  });
  await call(
    actor,
    'POST',
    `${path}/submit`,
    {
      draftVersion: draft.version,
      attestation: {
        authorized: true,
        submitterRole: 'Integrity Assurance Officer',
        approval: { kind: 'reference', reference: `CPC minutes Q${quarter}` },
      },
    },
    {
      'Idempotency-Key': `${getDb().runId}:${obligation.id}:${(obligation.currentRevision ?? 0) + 1}`,
    },
  );
  log(
    actor,
    `Responded to the ${institutionId} Q${quarter} clarification with a revised report`,
  );
}

async function setup() {
  if (!getDb().forms.some((form) => form.status === 'published')) {
    await call(ADMIN, 'POST', '/api/forms/form-v1/publish');
    log(ADMIN, 'Published reporting form version 1');
  }
  for (const institutionId of institutions) {
    const officer = officerOf(institutionId);
    // Foundation reviews: all checks met, except DEMO-005's risk assessment (PRD Example B).
    const foundations = await call<Foundations>(
      officer,
      'GET',
      `/api/institutions/${institutionId}/foundations`,
    );
    for (const indicator of foundations.indicators) {
      const active = indicator.versions.find(
        (version) => version.status === 'active',
      );
      if (!active || indicator.review) continue;
      const checks = active.claimedChecks.map((claimed) =>
        claimed
          ? { outcome: 'pass', passage: 'Section 2', reason: '' }
          : {
              outcome: 'fail',
              passage: '',
              reason:
                'Probability and impact are not scored on the declared scale.',
            },
      );
      await call(
        officer,
        'PUT',
        `/api/institutions/${institutionId}/foundations/${indicator.kind}/review`,
        { versionId: active.id, checks },
      );
    }
    // Baselines for Q2–Q4; DEMO-004's inflated proposal is returned and revised (AT31).
    const plan = await call<Plan>(
      officer,
      'GET',
      `/api/institutions/${institutionId}/plan`,
    );
    const latest = new Map<string, Baseline>();
    for (const baseline of plan.baselines)
      if ((latest.get(baseline.periodId)?.version ?? 0) < baseline.version)
        latest.set(baseline.periodId, baseline);
    for (let baseline of [...latest.values()].filter(
      (candidate) => candidate.status !== 'approved',
    )) {
      if (baseline.status === 'proposed' && baseline.milestones.length > 6) {
        await call(officer, 'POST', `/api/baselines/${baseline.id}/return`, {
          version: baseline.version,
          reason:
            'Administrative tasks artificially split the plan and dilute committee obligations.',
        });
        log(
          officer,
          `Returned ${institutionId} ${baseline.periodLabel} inflated baseline`,
        );
        baseline = { ...baseline, status: 'returned' };
      }
      if (baseline.status === 'returned') {
        const keep = baseline.milestones
          .filter((milestone) => !milestone.activity.startsWith('A-99'))
          .map((milestone) => milestone.id);
        baseline = await call<Baseline>(
          focal(institutionId),
          'POST',
          `/api/baselines/${baseline.id}/revise`,
          { version: baseline.version, milestoneIds: keep },
        );
        log(
          focal(institutionId),
          `Revised ${institutionId} ${baseline.periodLabel} baseline to ${keep.length} milestones`,
        );
      }
      await call(officer, 'POST', `/api/baselines/${baseline.id}/approve`, {
        version: baseline.version,
        rationale:
          'Milestones cover the material risks with objective completion conditions and both committee obligations.',
        checks: {
          materialCoverage: true,
          objectiveConditions: true,
          mandatoryObligations: true,
          noFragmentation: true,
        },
      });
    }
  }
  log('officers', 'Reviewed foundations and approved Q2–Q4 baselines');
  // DEMO-006: a future-quarter amendment that preserves earlier denominators.
  const plan = await call<Plan>(
    focal('DEMO-006'),
    'GET',
    '/api/institutions/DEMO-006/plan',
  );
  if (plan.amendments.length === 0) {
    const q3 = plan.baselines
      .filter((baseline) => baseline.periodId.endsWith('Q3'))
      .at(-1)!;
    const moved = q3.milestones.find(
      (milestone) => !milestone.mandatory && milestone.code === 'M-10',
    )!;
    const amendment = await call<{ id: string }>(
      focal('DEMO-006'),
      'POST',
      '/api/institutions/DEMO-006/amendments',
      {
        periodId: q3.periodId,
        milestoneId: moved.id,
        change: 'reschedule',
        toPeriodId: 'FY2026-27-Q4',
        reason: 'The spot-check team is only available in Q4.',
      },
    );
    await call(
      officerOf('DEMO-006'),
      'POST',
      `/api/amendments/${amendment.id}/decision`,
      {
        decision: 'confirmed',
        reason:
          'Resourcing constraint accepted; earlier quarters are unchanged.',
      },
    );
    log(
      officerOf('DEMO-006'),
      'Confirmed DEMO-006 amendment moving M-10 from Q3 to Q4',
    );
  }
}

export async function runScenario(): Promise<ScenarioResult> {
  steps.length = 0;
  suppressLatency(true);
  const previousSession = getDb().session;
  try {
    await setup();

    // Q1 (PRD §17.1): DEMO-002 declares minutes unavailable; DEMO-001/004/005 have unsupported claims.
    at('2026-10-05T10:00:00+03:00');
    for (const id of institutions)
      await submit(id, 1, { minutesUnavailable: id === 'DEMO-002' });
    at('2026-10-07T10:00:00+03:00');
    await clarify(
      'DEMO-002',
      1,
      'The minutes were declared unavailable. Please provide the signed CPC and IAO minutes.',
    );
    for (const id of institutions.filter(
      (candidate) => candidate !== 'DEMO-002',
    )) {
      const rejects: Record<string, Record<string, string>> = {
        'DEMO-001': {
          'M-01': 'The exception review is not recorded in the minutes.',
          'M-02': 'Training attendance is not recorded.',
        },
        'DEMO-004': {
          'M-01': 'The minutes do not show the authority matrix being applied.',
        },
        'DEMO-005': {
          'M-01': 'The rotation list is not evidenced.',
          'M-02': 'Training is not recorded in the minutes.',
        },
      };
      await review(id, 1, rejects[id]);
    }
    at('2026-10-08T10:00:00+03:00');
    await respond('DEMO-002', 1, async (bundle) => {
      const cpc = (
        await upload('DEMO-002', 1, 'cpc-minutes-q1-signed.pdf', 'cpc_minutes')
      ).id;
      const iao = (
        await upload('DEMO-002', 1, 'iao-minutes-q1-signed.pdf', 'iao_minutes')
      ).id;
      return claimAll(bundle, cpc, iao);
    });
    at('2026-10-09T10:00:00+03:00');
    await review('DEMO-002', 1);

    // Q2: DEMO-003 misses the deadline; DEMO-007 uploads minutes for the wrong period.
    at('2027-01-05T10:00:00+03:00');
    for (const id of institutions.filter(
      (candidate) => candidate !== 'DEMO-003',
    ))
      await submit(
        id,
        2,
        id === 'DEMO-007' ? { cpcName: 'cpc-minutes-q1-2026.pdf' } : {},
      );
    at('2027-01-07T10:00:00+03:00');
    await clarify(
      'DEMO-007',
      2,
      'The CPC minutes attached are for Q1, not Q2. Please provide the Q2 minutes.',
    );
    await review('DEMO-001', 2, {
      'M-05': 'No exception review is recorded for Q2.',
    });
    await review('DEMO-005', 2, {
      'M-05': 'No exception review is recorded for Q2.',
    });
    for (const id of ['DEMO-002', 'DEMO-004', 'DEMO-006', 'DEMO-008'])
      await review(id, 2);
    at('2027-01-08T10:00:00+03:00');
    await respond('DEMO-007', 2, async (bundle) => {
      const wrong = bundle.evidence.find(
        (item) => item.category === 'cpc_minutes' && !item.supersededBy,
      )!;
      const replacement = (
        await upload(
          'DEMO-007',
          2,
          'cpc-minutes-q2-2027.pdf',
          'cpc_minutes',
          wrong.id,
        )
      ).id;
      const answers = structuredClone(bundle.draft!.answers);
      const swap = (id: string) => (id === wrong.id ? replacement : id);
      for (const value of Object.values(answers.questions))
        if (value && typeof value === 'object')
          value.evidenceIds = value.evidenceIds.map(swap);
      for (const response of Object.values(answers.milestones))
        response.evidence = response.evidence.map((reference) => ({
          ...reference,
          evidenceId: swap(reference.evidenceId),
        }));
      return answers;
    });
    at('2027-01-09T10:00:00+03:00');
    await review('DEMO-007', 2);
    at('2027-01-12T10:00:00+03:00');
    if (officerOf('DEMO-008') === 'officer-b') {
      await call(ADMIN, 'POST', '/api/assignments', {
        institutionId: 'DEMO-008',
        officerId: 'officer-a',
        reason: 'Portfolio rebalanced after Q2.',
      });
      log(ADMIN, 'Reassigned DEMO-008 from Officer B to Officer A');
    }
    at('2027-01-16T10:00:00+03:00');
    await submit('DEMO-003', 2);
    at('2027-01-18T10:00:00+03:00');
    await review('DEMO-003', 2);

    // Q3: DEMO-005 does not report.
    at('2027-04-05T10:00:00+03:00');
    for (const id of institutions.filter(
      (candidate) => candidate !== 'DEMO-005',
    ))
      await submit(id, 3);
    at('2027-04-07T10:00:00+03:00');
    for (const id of institutions) await review(id, 3);

    // Q4.
    at('2027-07-05T10:00:00+03:00');
    for (const id of institutions) await submit(id, 4);
    at('2027-07-07T10:00:00+03:00');
    for (const id of institutions) await review(id, 4);

    // After the cutoff the officer records DEMO-005's Q3 non-response; publication is left to the administrator.
    at('2027-08-01T08:00:00+03:00');
    const q3 = getDb().obligations.find(
      (candidate) => candidate.id === obligationId('DEMO-005', 3),
    )!;
    if (q3.state === 'not_started' || q3.state === 'draft') {
      await call(
        officerOf('DEMO-005'),
        'POST',
        `/api/obligations/${encodeURIComponent(q3.id)}/close-nonresponse`,
        { reason: 'No Q3 report was received by the evaluation cutoff.' },
      );
      log(officerOf('DEMO-005'), 'Closed DEMO-005 Q3 without submission');
    }
    return { steps: [...steps], businessTime: getDb().businessTime };
  } finally {
    suppressLatency(false);
    commit((db) => {
      db.session = previousSession;
    });
  }
}
