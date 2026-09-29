import { http, HttpResponse } from 'msw';
import {
  amendmentDecisionSchema,
  amendmentRequestSchema,
  approveBaselineRequestSchema,
  confirmSeedRequestSchema,
  returnBaselineRequestSchema,
  type Activity,
  type Baseline,
  type Plan,
  type PlannedMilestone,
} from '@cpi/contracts';
import { commit, getDb, nextId } from '../db';
import type { MockBaseline } from '../seed/baselines';
import type { MockUser } from '../seed/cast';
import {
  assignedOfficers,
  audit,
  institutionUsers,
  notify,
} from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { periodLocked, proposalsFor } from '../services/plans';
import { baselineOf, periodOf } from '../services/reporting';
import { assignedInstitutionIds, canReadInstitution } from '../services/scope';
import { requireRole, requireUser } from '../services/session';

/** A baseline locks once reporting opens on its period or any work has started (PRD §10.4). */
function locked(baseline: MockBaseline) {
  return periodLocked(
    getDb(),
    baseline.institutionId,
    periodOf(baseline.periodId),
  );
}

function toBaseline(baseline: MockBaseline): Baseline {
  return {
    ...baseline,
    periodLabel: periodOf(baseline.periodId).label,
    locked: locked(baseline),
  };
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const longDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]} ${year}`;
};

export function planFor(user: MockUser, institutionId: string): Plan {
  const db = getDb();
  const mine = <T extends { institutionId: string }>(item: T) =>
    item.institutionId === institutionId;
  const record = db.planApprovals.find(mine);
  const approval = record
    ? {
        approvingBody: record.approvingBody,
        approvedOn: record.approvedOn,
        reference: record.reference,
        accountingOfficer: record.accountingOfficer,
        documentVersionId: record.documentVersionId,
        recordedBy: record.recordedBy,
        recordedAt: record.recordedAt,
      }
    : null;
  return {
    institutionId,
    institutionName:
      db.institutions.find((institution) => institution.id === institutionId)
        ?.name ?? institutionId,
    approvedPlanReference: approval
      ? `${approval.reference}, approved by the ${approval.approvingBody} on ${longDate(approval.approvedOn)}`
      : 'No plan approval recorded yet',
    approval,
    risks: db.risks
      .filter(mine)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((risk) => ({
        id: risk.id,
        code: risk.code,
        description: risk.description,
        cause: risk.cause,
        probability: risk.probability,
        impact: risk.impact,
        severity: risk.probability * risk.impact,
      })),
    activities: db.activities
      .filter(mine)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((activity): Activity => ({
        id: activity.id,
        code: activity.code,
        riskId: activity.riskId,
        title: activity.title,
        strategy: activity.strategy,
        output: activity.output,
        kpi: activity.kpi,
        target: activity.target,
        owner: activity.owner,
        resourceReference: activity.resourceReference,
      })),
    plannedMilestones: db.plannedMilestones
      .filter(mine)
      .sort(
        (a, b) =>
          a.periodId.localeCompare(b.periodId) || a.code.localeCompare(b.code),
      )
      .map((milestone): PlannedMilestone => ({
        id: milestone.id,
        code: milestone.code,
        activityId: milestone.activityId,
        periodId: milestone.periodId,
        title: milestone.title,
        completionCondition: milestone.completionCondition,
        evidenceExpectation: milestone.evidenceExpectation,
      })),
    proposals: proposalsFor(db, institutionId),
    baselines: db.baselines
      .filter(mine)
      .sort(
        (a, b) => a.periodId.localeCompare(b.periodId) || a.version - b.version,
      )
      .map(toBaseline),
    amendments: db.amendments.filter(mine),
    editable:
      user.role === 'institution' && user.institutionId === institutionId,
  };
}

function readableInstitution(user: MockUser, institutionId: unknown) {
  if (
    typeof institutionId !== 'string' ||
    !canReadInstitution(user, institutionId)
  )
    throw notFound();
  return institutionId;
}

/** The latest version of a baseline, acted on by its assigned officer. */
function assignedBaseline(user: MockUser, baselineId: unknown) {
  const baseline = getDb().baselines.find(
    (candidate) => candidate.id === baselineId,
  );
  if (!baseline || !canReadInstitution(user, baseline.institutionId))
    throw notFound();
  if (
    user.role !== 'officer' ||
    !assignedInstitutionIds(user.id).includes(baseline.institutionId)
  ) {
    throw apiError(
      403,
      'Only the assigned officer can act on this baseline.',
      'forbidden',
    );
  }
  return baseline;
}

function requireLatest(baseline: MockBaseline, version: number) {
  if (
    baselineOf(baseline.institutionId, baseline.periodId)?.version !==
      version ||
    baseline.version !== version
  ) {
    throw apiError(
      409,
      'This baseline has a newer version. Reload before acting on it.',
      'version_conflict',
    );
  }
}

export const planningHandlers = [
  http.get('/api/institutions/:institutionId/plan', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    return HttpResponse.json(
      planFor(user, readableInstitution(user, params.institutionId)),
    );
  }),

  http.post(
    '/api/baselines/:baselineId/approve',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const baseline = assignedBaseline(user, params.baselineId);
      const parsed = approveBaselineRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) {
        return apiError(
          422,
          'Confirm every approval check and give a rationale of at least 20 characters.',
          'approval_incomplete',
          {
            rationale: 'Give a rationale of at least 20 characters.',
          },
        );
      }
      requireLatest(baseline, parsed.data.version);
      if (baseline.status === 'approved')
        return apiError(
          409,
          'This baseline is already approved.',
          'already_approved',
        );
      if (baseline.milestones.length === 0)
        return apiError(
          422,
          'An empty baseline cannot be approved; it would give automatic full credit.',
          'empty_baseline',
        );
      const committees = baseline.milestones.filter(
        (milestone) => milestone.mandatory,
      );
      if (committees.length < 2)
        return apiError(
          422,
          'The baseline must include both the CPC and IAO meeting obligations.',
          'mandatory_missing',
        );
      commit((db) => {
        baseline.status = 'approved';
        baseline.returned = null;
        baseline.approval = {
          by: user.displayName,
          at: db.businessTime,
          rationale: parsed.data.rationale.trim(),
          checks: parsed.data.checks,
        };
        audit(
          db,
          user,
          'baseline.approve',
          { type: 'baseline', id: baseline.id, version: baseline.version },
          `${baseline.institutionId} ${periodOf(baseline.periodId).label}: ${baseline.milestones.length} milestones`,
        );
        notify(
          db,
          `${baseline.id}:approved`,
          'baseline.approved',
          institutionUsers(baseline.institutionId),
          {
            title: `${periodOf(baseline.periodId).label} baseline approved`,
            body: `Your officer approved ${baseline.milestones.length} milestones for ${periodOf(baseline.periodId).label}.`,
            link: '/institution/plan',
          },
        );
      });
      return HttpResponse.json(toBaseline(baseline));
    },
  ),

  http.post(
    '/api/baselines/:baselineId/return',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const baseline = assignedBaseline(user, params.baselineId);
      const parsed = returnBaselineRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path[0]);
        return apiError(
          422,
          'Say which checks are not met and give a reason of at least 10 characters.',
          'reason_required',
          {
            ...(fields.includes('reason')
              ? { reason: 'Give a reason of at least 10 characters.' }
              : {}),
            ...(fields.includes('failedChecks')
              ? { failedChecks: 'Choose at least one check that is not met.' }
              : {}),
          },
        );
      }
      requireLatest(baseline, parsed.data.version);
      if (baseline.status !== 'proposed')
        return apiError(
          409,
          'Only a proposed baseline can be returned.',
          'not_proposed',
        );
      commit((db) => {
        baseline.status = 'returned';
        baseline.returned = {
          by: user.displayName,
          at: db.businessTime,
          reason: parsed.data.reason.trim(),
          failedChecks: parsed.data.failedChecks,
        };
        audit(
          db,
          user,
          'baseline.return',
          { type: 'baseline', id: baseline.id, version: baseline.version },
          parsed.data.reason.trim(),
        );
        notify(
          db,
          `${baseline.id}:returned`,
          'baseline.returned',
          institutionUsers(baseline.institutionId),
          {
            title: `${periodOf(baseline.periodId).label} baseline returned for revision`,
            body: `Your officer returned the proposed baseline: ${parsed.data.reason.trim()}`,
            link: '/institution/plan',
          },
        );
      });
      return HttpResponse.json(toBaseline(baseline));
    },
  ),

  http.post(
    '/api/baselines/:baselineId/confirm-seed',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const baseline = assignedBaseline(user, params.baselineId);
      const parsed = confirmSeedRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'The request is missing its version.',
          'invalid_request',
        );
      requireLatest(baseline, parsed.data.version);
      if (!baseline.historicalSeed)
        return apiError(
          409,
          'This is not a seeded historical baseline.',
          'not_seeded',
        );
      if (baseline.historicalSeed.confirmedAt)
        return apiError(409, 'Already confirmed.', 'already_confirmed');
      commit((db) => {
        // Actual confirmation time is recorded; nothing is backdated (PRD §10.4).
        baseline.historicalSeed = {
          ...baseline.historicalSeed!,
          confirmedBy: user.displayName,
          confirmedAt: db.businessTime,
        };
        audit(
          db,
          user,
          'baseline.confirm_seed',
          { type: 'baseline', id: baseline.id, version: baseline.version },
          'Confirmed correspondence with the fictional approved plan',
        );
      });
      return HttpResponse.json(toBaseline(baseline));
    },
  ),

  http.post(
    '/api/institutions/:institutionId/amendments',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('institution');
      const institutionId = readableInstitution(user, params.institutionId);
      const parsed = amendmentRequestSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'invalid_amendment',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      const baseline = baselineOf(institutionId, parsed.data.periodId);
      const milestone = baseline?.milestones.find(
        (candidate) => candidate.id === parsed.data.milestoneId,
      );
      if (!baseline || !milestone) return notFound();
      // No retrospective change: an opened or started period keeps its denominator (AT17).
      if (locked(baseline))
        return apiError(
          409,
          'Reporting has opened for this period, so its baseline can no longer change.',
          'baseline_locked',
        );
      // Until approval, the institution changes its plan and proposes again instead.
      if (baseline.status !== 'approved')
        return apiError(
          409,
          'This baseline is not approved yet. Change the planned milestones and propose it again.',
          'baseline_not_approved',
        );
      if (milestone.mandatory)
        return apiError(
          422,
          'Committee meeting obligations cannot be removed or moved by the institution.',
          'mandatory_milestone',
        );
      if (parsed.data.change === 'reschedule') {
        const target = parsed.data.toPeriodId
          ? baselineOf(institutionId, parsed.data.toPeriodId)
          : undefined;
        if (
          !target ||
          periodOf(target.periodId).quarter <=
            periodOf(baseline.periodId).quarter ||
          locked(target)
        ) {
          return apiError(
            422,
            'Choose a later period whose reporting has not opened.',
            'invalid_target',
            { toPeriodId: 'Choose a later, unopened period.' },
          );
        }
      }
      if (
        getDb().amendments.some(
          (amendment) =>
            amendment.milestoneId === milestone.id &&
            amendment.status === 'pending',
        )
      ) {
        return apiError(
          409,
          'An amendment for this milestone is already awaiting your officer.',
          'amendment_pending',
        );
      }
      const amendment = {
        id: nextId('amd'),
        institutionId,
        periodId: baseline.periodId,
        milestoneId: milestone.id,
        milestoneCode: milestone.code,
        change: parsed.data.change,
        toPeriodId:
          parsed.data.change === 'reschedule' ? parsed.data.toPeriodId : null,
        reason: parsed.data.reason.trim(),
        status: 'pending' as const,
        requestedBy: user.displayName,
        requestedAt: getDb().businessTime,
        decidedBy: null,
        decidedAt: null,
        decisionReason: null,
      };
      commit((db) => {
        db.amendments.push(amendment);
        audit(
          db,
          user,
          'amendment.request',
          { type: 'amendment', id: amendment.id },
          `${amendment.change} ${milestone.code}: ${amendment.reason}`,
        );
        notify(
          db,
          amendment.id,
          'amendment.requested',
          assignedOfficers(institutionId),
          {
            title: `Baseline amendment requested: ${institutionId}`,
            body: `${institutionId} asks to ${amendment.change} ${milestone.code} in ${periodOf(baseline.periodId).label}.`,
            link: `/officer/institutions/${institutionId}`,
          },
        );
      });
      return HttpResponse.json(amendment, { status: 201 });
    },
  ),

  http.post(
    '/api/amendments/:amendmentId/decision',
    async ({ params, request }) => {
      await networkDelay();
      const user = requireRole('officer', 'supervisor', 'administrator');
      const amendment = getDb().amendments.find(
        (candidate) => candidate.id === params.amendmentId,
      );
      if (!amendment || !canReadInstitution(user, amendment.institutionId))
        return notFound();
      if (
        user.role !== 'officer' ||
        !assignedInstitutionIds(user.id).includes(amendment.institutionId)
      ) {
        return apiError(
          403,
          'Only the assigned officer can decide amendments.',
          'forbidden',
        );
      }
      const parsed = amendmentDecisionSchema.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!parsed.success)
        return apiError(
          422,
          'Give a reason of at least 10 characters.',
          'reason_required',
          { reason: 'Give a reason of at least 10 characters.' },
        );
      if (amendment.status !== 'pending')
        return apiError(
          409,
          'This amendment has already been decided.',
          'already_decided',
        );
      const source = baselineOf(amendment.institutionId, amendment.periodId)!;
      if (parsed.data.decision === 'confirmed' && locked(source))
        return apiError(
          409,
          'Reporting has opened for this period; the amendment can no longer apply.',
          'baseline_locked',
        );
      commit((db) => {
        amendment.status = parsed.data.decision;
        amendment.decidedBy = user.displayName;
        amendment.decidedAt = db.businessTime;
        amendment.decisionReason = parsed.data.reason.trim();
        if (parsed.data.decision === 'confirmed') {
          // A new version for each affected period; the original baseline is retained.
          const moved = source.milestones.find(
            (milestone) => milestone.id === amendment.milestoneId,
          )!;
          const nextVersion = (
            baseline: MockBaseline,
            milestones: MockBaseline['milestones'],
          ): MockBaseline => ({
            ...structuredClone(baseline),
            id: `bl-${baseline.institutionId}-${periodOf(baseline.periodId).label}-v${baseline.version + 1}`,
            version: baseline.version + 1,
            milestones,
            approval: baseline.approval && {
              ...baseline.approval,
              by: user.displayName,
              at: db.businessTime,
              rationale: `Amendment ${amendment.id} confirmed: ${amendment.reason}`,
            },
          });
          db.baselines.push(
            nextVersion(
              source,
              source.milestones.filter(
                (milestone) => milestone.id !== moved.id,
              ),
            ),
          );
          if (amendment.change === 'reschedule' && amendment.toPeriodId) {
            const target = baselineOf(
              amendment.institutionId,
              amendment.toPeriodId,
            )!;
            db.baselines.push(
              nextVersion(target, [...target.milestones, moved]),
            );
          }
          // The plan follows the confirmed change, so a later proposal does not undo it.
          const planned = db.plannedMilestones.find(
            (milestone) => milestone.id === moved.id,
          );
          if (planned && amendment.change === 'reschedule')
            planned.periodId = amendment.toPeriodId!;
          if (planned && amendment.change === 'remove')
            db.plannedMilestones = db.plannedMilestones.filter(
              (milestone) => milestone !== planned,
            );
        }
        audit(
          db,
          user,
          `amendment.${parsed.data.decision}`,
          { type: 'amendment', id: amendment.id },
          parsed.data.reason.trim(),
        );
        notify(
          db,
          `${amendment.id}:decided`,
          'amendment.decided',
          institutionUsers(amendment.institutionId),
          {
            title: `Baseline amendment ${parsed.data.decision}`,
            body: `Your request to ${amendment.change} ${amendment.milestoneCode} was ${parsed.data.decision}.`,
            link: '/institution/plan',
          },
        );
      });
      return HttpResponse.json(planFor(user, amendment.institutionId));
    },
  ),
];
