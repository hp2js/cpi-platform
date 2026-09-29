import { http, HttpResponse } from 'msw';
import {
  activityRequestSchema,
  planApprovalRequestSchema,
  planImportRequestSchema,
  plannedMilestoneRequestSchema,
  proposeBaselineRequestSchema,
  riskRequestSchema,
} from '@cpi/contracts';
import type { z } from 'zod';
import { commit, getDb, nextId, type MockDb } from '../db';
import type { MockBaseline } from '@cpi/contracts/fixtures';
import type { MockUser } from '@cpi/contracts/fixtures';
import { assignedOfficers, audit, notify } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { issueMessages, previewPlanImport } from '../services/plan-import';
import {
  latestBaseline,
  periodLocked,
  proposedMilestones,
  sameMilestones,
} from '../services/plans';
import { requireRole } from '../services/session';
import { planFor } from './planning';

/**
 * The institution maintains its own plan (FR04): the approval record, risks, activities and
 * quarterly milestones, and proposes each quarter's baseline from them. Only the institution's
 * own focal persons edit it; officers read it and approve or return the proposals.
 */

async function body<T>(request: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success)
    throw apiError(
      422,
      'Some values need attention.',
      'invalid_plan',
      issueMessages(parsed.error),
    );
  return parsed.data;
}

/** The signed-in focal person, acting on their own institution's plan. */
function ownPlan(institutionId: unknown): {
  user: MockUser;
  institutionId: string;
} {
  const user = requireRole('institution');
  if (institutionId !== user.institutionId) throw notFound();
  return { user, institutionId: user.institutionId! };
}

const own =
  (institutionId: string) =>
  <T extends { institutionId: string }>(item: T) =>
    item.institutionId === institutionId;

function duplicateCode(
  items: { id: string; code: string; institutionId: string }[],
  institutionId: string,
  code: string,
  except?: string,
) {
  if (
    items.some(
      (item) =>
        item.institutionId === institutionId &&
        item.code === code &&
        item.id !== except,
    )
  )
    throw apiError(422, `${code} is already in the plan.`, 'duplicate_code', {
      code: `${code} is already in the plan. Use another code.`,
    });
}

/**
 * A quarter's planned milestones change only while its baseline is open to proposal: not yet
 * approved and not locked. After approval, changes go through amendments (PRD §10.4).
 */
function requireOpenQuarter(
  db: MockDb,
  institutionId: string,
  periodId: string,
) {
  const period = db.cycle.periods.find((item) => item.id === periodId);
  if (!period)
    throw apiError(422, 'Choose a quarter.', 'invalid_plan', {
      periodId: 'Choose a quarter.',
    });
  if (periodLocked(db, institutionId, period))
    throw apiError(
      409,
      `Reporting has opened for ${period.label}, so its milestones can no longer change.`,
      'baseline_locked',
    );
  if (latestBaseline(db, institutionId, period.id)?.status === 'approved')
    throw apiError(
      409,
      `The ${period.label} baseline is approved. Request an amendment to change it.`,
      'baseline_approved',
    );
  return period;
}

const riskFields = (input: z.infer<typeof riskRequestSchema>) => ({
  code: input.code,
  description: input.description,
  cause: input.cause,
  probability: input.probability,
  impact: input.impact,
});

export const planEditorHandlers = [
  http.put(
    '/api/institutions/:institutionId/plan/approval',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, planApprovalRequestSchema);
      const db = getDb();
      if (input.approvedOn > db.businessTime.slice(0, 10))
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          approvedOn: 'The approval date cannot be in the future.',
        });
      if (
        input.documentVersionId &&
        !db.foundationVersions.some(
          (version) =>
            version.id === input.documentVersionId &&
            version.institutionId === institutionId &&
            version.kind === 'mitigation_plan',
        )
      )
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          documentVersionId: 'Choose one of your mitigation plan versions.',
        });
      commit((store) => {
        store.planApprovals = store.planApprovals.filter(
          (approval) => approval.institutionId !== institutionId,
        );
        store.planApprovals.push({
          institutionId,
          ...input,
          recordedBy: user.displayName,
          recordedAt: store.businessTime,
        });
        audit(
          store,
          user,
          'plan.approval_record',
          { type: 'plan', id: institutionId },
          `${input.approvingBody}, ${input.approvedOn}: ${input.reference}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.post(
    '/api/institutions/:institutionId/risks',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, riskRequestSchema);
      duplicateCode(getDb().risks, institutionId, input.code);
      commit((db) => {
        db.risks.push({
          id: nextId('risk'),
          institutionId,
          ...riskFields(input),
        });
        audit(
          db,
          user,
          'plan.risk_add',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.description}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId), { status: 201 });
    },
  ),

  http.put(
    '/api/institutions/:institutionId/risks/:riskId',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, riskRequestSchema);
      const risk = getDb()
        .risks.filter(own(institutionId))
        .find((item) => item.id === params.riskId);
      if (!risk) return notFound();
      duplicateCode(getDb().risks, institutionId, input.code, risk.id);
      commit((db) => {
        Object.assign(risk, riskFields(input));
        audit(
          db,
          user,
          'plan.risk_update',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.description}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.delete(
    '/api/institutions/:institutionId/risks/:riskId',
    async ({ params }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const db = getDb();
      const risk = db.risks
        .filter(own(institutionId))
        .find((item) => item.id === params.riskId);
      if (!risk) return notFound();
      if (db.activities.some((activity) => activity.riskId === risk.id))
        return apiError(
          409,
          `Activities treat ${risk.code}. Move or remove them first.`,
          'risk_in_use',
        );
      commit((store) => {
        store.risks = store.risks.filter((item) => item.id !== risk.id);
        audit(
          store,
          user,
          'plan.risk_remove',
          { type: 'plan', id: institutionId },
          risk.code,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.post(
    '/api/institutions/:institutionId/activities',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, activityRequestSchema);
      const db = getDb();
      if (
        !db.risks
          .filter(own(institutionId))
          .some((risk) => risk.id === input.riskId)
      )
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      duplicateCode(db.activities, institutionId, input.code);
      commit((store) => {
        store.activities.push({ id: nextId('act'), institutionId, ...input });
        audit(
          store,
          user,
          'plan.activity_add',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.title}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId), { status: 201 });
    },
  ),

  http.put(
    '/api/institutions/:institutionId/activities/:activityId',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, activityRequestSchema);
      const db = getDb();
      const activity = db.activities
        .filter(own(institutionId))
        .find((item) => item.id === params.activityId);
      if (!activity) return notFound();
      if (
        !db.risks
          .filter(own(institutionId))
          .some((risk) => risk.id === input.riskId)
      )
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      duplicateCode(db.activities, institutionId, input.code, activity.id);
      commit((store) => {
        Object.assign(activity, input);
        audit(
          store,
          user,
          'plan.activity_update',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.title}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.delete(
    '/api/institutions/:institutionId/activities/:activityId',
    async ({ params }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const db = getDb();
      const activity = db.activities
        .filter(own(institutionId))
        .find((item) => item.id === params.activityId);
      if (!activity) return notFound();
      const inUse =
        db.plannedMilestones.some((item) => item.activityId === activity.id) ||
        db.baselines.some((baseline) =>
          baseline.milestones.some((item) => item.activityId === activity.id),
        );
      if (inUse)
        return apiError(
          409,
          `Milestones belong to ${activity.code}, in the plan or a baseline. It can be edited but not removed.`,
          'activity_in_use',
        );
      commit((store) => {
        store.activities = store.activities.filter(
          (item) => item.id !== activity.id,
        );
        audit(
          store,
          user,
          'plan.activity_remove',
          { type: 'plan', id: institutionId },
          activity.code,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.post(
    '/api/institutions/:institutionId/plan-milestones',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, plannedMilestoneRequestSchema);
      const db = getDb();
      if (
        !db.activities
          .filter(own(institutionId))
          .some((item) => item.id === input.activityId)
      )
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      requireOpenQuarter(db, institutionId, input.periodId);
      duplicateCode(db.plannedMilestones, institutionId, input.code);
      commit((store) => {
        store.plannedMilestones.push({
          id: nextId('pm'),
          institutionId,
          ...input,
        });
        audit(
          store,
          user,
          'plan.milestone_add',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.title}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId), { status: 201 });
    },
  ),

  http.put(
    '/api/institutions/:institutionId/plan-milestones/:milestoneId',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, plannedMilestoneRequestSchema);
      const db = getDb();
      const milestone = db.plannedMilestones
        .filter(own(institutionId))
        .find((item) => item.id === params.milestoneId);
      if (!milestone) return notFound();
      if (
        !db.activities
          .filter(own(institutionId))
          .some((item) => item.id === input.activityId)
      )
        return apiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      requireOpenQuarter(db, institutionId, milestone.periodId);
      requireOpenQuarter(db, institutionId, input.periodId);
      duplicateCode(
        db.plannedMilestones,
        institutionId,
        input.code,
        milestone.id,
      );
      commit((store) => {
        Object.assign(milestone, input);
        audit(
          store,
          user,
          'plan.milestone_update',
          { type: 'plan', id: institutionId },
          `${input.code} ${input.title}`,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  http.delete(
    '/api/institutions/:institutionId/plan-milestones/:milestoneId',
    async ({ params }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const db = getDb();
      const milestone = db.plannedMilestones
        .filter(own(institutionId))
        .find((item) => item.id === params.milestoneId);
      if (!milestone) return notFound();
      requireOpenQuarter(db, institutionId, milestone.periodId);
      commit((store) => {
        store.plannedMilestones = store.plannedMilestones.filter(
          (item) => item.id !== milestone.id,
        );
        audit(
          store,
          user,
          'plan.milestone_remove',
          { type: 'plan', id: institutionId },
          milestone.code,
        );
      });
      return HttpResponse.json(planFor(user, institutionId));
    },
  ),

  /** Copies the quarter's planned milestones, with both committee meetings, into a new version. */
  http.post(
    '/api/institutions/:institutionId/baselines/:periodId/propose',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, proposeBaselineRequestSchema);
      const db = getDb();
      const period = requireOpenQuarter(
        db,
        institutionId,
        String(params.periodId),
      );
      const current = latestBaseline(db, institutionId, period.id);
      const milestones = proposedMilestones(db, institutionId, period);
      if (!milestones.some((milestone) => !milestone.mandatory))
        return apiError(
          422,
          `Plan at least one milestone for ${period.label} before proposing its baseline.`,
          'empty_baseline',
        );
      const unchanged =
        current?.status === 'proposed' &&
        sameMilestones(current.milestones, milestones);
      if (unchanged)
        return apiError(
          409,
          `The ${period.label} baseline is already proposed with these milestones.`,
          'already_proposed',
        );
      const version = (current?.version ?? 0) + 1;
      const proposal: MockBaseline = {
        id: `bl-${institutionId}-${period.label}-v${version}`,
        institutionId,
        periodId: period.id,
        version,
        status: 'proposed',
        milestones,
        historicalSeed: null,
        approval: null,
        returned: null,
      };
      const substantive = milestones.filter(
        (milestone) => !milestone.mandatory,
      ).length;
      commit((store) => {
        store.baselines.push(proposal);
        audit(
          store,
          user,
          'baseline.propose',
          { type: 'baseline', id: proposal.id, version },
          `${period.label}: ${substantive} planned milestones and the committee meetings${input.note ? `. ${input.note}` : ''}`,
        );
        notify(
          store,
          `${proposal.id}:proposed`,
          'baseline.proposed',
          assignedOfficers(institutionId),
          {
            title: `Baseline proposed: ${institutionId} ${period.label}`,
            body: `${milestones.length} milestones are proposed for approval${input.note ? `: ${input.note}` : '.'}`,
            link: `/officer/institutions/${institutionId}`,
          },
        );
      });
      return HttpResponse.json(planFor(user, institutionId), { status: 201 });
    },
  ),

  http.post(
    '/api/institutions/:institutionId/plan/import/preview',
    async ({ params, request }) => {
      await networkDelay();
      const { institutionId } = ownPlan(params.institutionId);
      const input = await body(request, planImportRequestSchema);
      return HttpResponse.json(
        previewPlanImport(getDb(), institutionId, input.csv).preview,
      );
    },
  ),

  // All or nothing, like the institution import: fix the file and run it again.
  http.post(
    '/api/institutions/:institutionId/plan/import',
    async ({ params, request }) => {
      await networkDelay();
      const { user, institutionId } = ownPlan(params.institutionId);
      const input = await body(request, planImportRequestSchema);
      const { preview, rows } = previewPlanImport(
        getDb(),
        institutionId,
        input.csv,
      );
      if (preview.fileErrors.length || preview.invalid)
        return apiError(
          422,
          preview.fileErrors[0] ??
            `${preview.invalid} ${preview.invalid === 1 ? 'row needs' : 'rows need'} attention; nothing was imported.`,
          'import_invalid',
        );
      const counts = { risks: 0, activities: 0, milestones: 0 };
      commit((db) => {
        const mine = own(institutionId);
        for (const row of rows.filter((item) => item.record === 'risk')) {
          const existing = db.risks
            .filter(mine)
            .find((item) => item.code === row.input.code);
          if (existing) Object.assign(existing, riskFields(row.input));
          else
            db.risks.push({
              id: nextId('risk'),
              institutionId,
              ...riskFields(row.input),
            });
          counts.risks += 1;
        }
        for (const row of rows) {
          if (row.record !== 'activity') continue;
          const riskId = db.risks
            .filter(mine)
            .find((item) => item.code === row.link)!.id;
          const existing = db.activities
            .filter(mine)
            .find((item) => item.code === row.input.code);
          if (existing) Object.assign(existing, { ...row.input, riskId });
          else
            db.activities.push({
              id: nextId('act'),
              institutionId,
              ...row.input,
              riskId,
            });
          counts.activities += 1;
        }
        for (const row of rows) {
          if (row.record !== 'milestone') continue;
          const activityId = db.activities
            .filter(mine)
            .find((item) => item.code === row.link)!.id;
          const existing = db.plannedMilestones
            .filter(mine)
            .find((item) => item.code === row.input.code);
          if (existing) Object.assign(existing, { ...row.input, activityId });
          else
            db.plannedMilestones.push({
              id: nextId('pm'),
              institutionId,
              ...row.input,
              activityId,
            });
          counts.milestones += 1;
        }
        audit(
          db,
          user,
          'plan.import',
          { type: 'plan', id: institutionId },
          `${counts.risks} risks, ${counts.activities} activities, ${counts.milestones} milestones`,
        );
      });
      return HttpResponse.json(counts);
    },
  ),
];
