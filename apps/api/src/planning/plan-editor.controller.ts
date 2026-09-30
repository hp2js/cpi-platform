import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  activityRequestSchema,
  issueMessages,
  planApprovalRequestSchema,
  planImportRequestSchema,
  plannedMilestoneRequestSchema,
  previewPlanImport,
  proposeBaselineRequestSchema,
  riskRequestSchema,
  sameMilestones,
  type PlanImportResult,
} from '@cpi/contracts';
import type { z } from 'zod';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write, type Db, type Tx } from '../database/db';
import {
  activities,
  baselines,
  foundationVersions,
  planApprovals,
  plannedMilestones,
  risks,
} from '../database/schema';
import { loadCycle } from '../database/state';
import { Events, assignedOfficers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import {
  latestOf,
  periodLocked,
  planData,
  planFor,
  proposedMilestones,
} from './plans';

/*
 * The institution maintains its own plan (FR04): the approval record, risks, activities and
 * quarterly milestones, and proposes each quarter's baseline from them. Only the institution's
 * own focal persons edit it; officers read it and approve or return the proposals. Ported
 * from the mock API's handlers/plan-editor.ts.
 */

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      422,
      'Some values need attention.',
      'invalid_plan',
      issueMessages(parsed.error),
    );
  return parsed.data;
}

/** The signed-in focal person, acting on their own institution's plan. */
function ownPlan(user: User, institutionId: string) {
  if (user.institutionId !== institutionId) throw notFound();
  return institutionId;
}

async function duplicateCode(
  tx: Tx,
  table: typeof risks | typeof activities | typeof plannedMilestones,
  institutionId: string,
  code: string,
  except?: string,
) {
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.institutionId, institutionId), eq(table.code, code)));
  // The code passed the code pattern, so repeating it back is safe.
  if (rows.some((row) => row.id !== except))
    throw new ApiError(
      422,
      `${code} is already in the plan.`,
      'duplicate_code',
      {
        code: `${code} is already in the plan. Use another code.`,
      },
    );
}

/**
 * A quarter's planned milestones change only while its baseline is open to proposal: not yet
 * approved and not locked. After approval, changes go through amendments (PRD §10.4).
 */
async function requireOpenQuarter(
  tx: Tx,
  institutionId: string,
  periodId: string,
  businessTime: string,
) {
  const cycle = await loadCycle(tx);
  const period = cycle.periods.find((item) => item.id === periodId);
  if (!period)
    throw new ApiError(422, 'Choose a quarter.', 'invalid_plan', {
      periodId: 'Choose a quarter.',
    });
  if (await periodLocked(tx, institutionId, period, businessTime))
    throw new ApiError(
      409,
      `Reporting has opened for ${period.label}, so its milestones can no longer change.`,
      'baseline_locked',
    );
  const [current] = await tx
    .select({ status: baselines.status })
    .from(baselines)
    .where(
      and(
        eq(baselines.institutionId, institutionId),
        eq(baselines.periodId, period.id),
      ),
    )
    .orderBy(desc(baselines.version))
    .limit(1);
  if (current?.status === 'approved')
    throw new ApiError(
      409,
      `The ${period.label} baseline is approved. Request an amendment to change it.`,
      'baseline_approved',
    );
  return period;
}

async function ownRisk(tx: Db, institutionId: string, id: string) {
  const [row] = await tx
    .select()
    .from(risks)
    .where(and(eq(risks.institutionId, institutionId), eq(risks.id, id)));
  return row;
}

async function ownActivity(tx: Db, institutionId: string, id: string) {
  const [row] = await tx
    .select()
    .from(activities)
    .where(
      and(eq(activities.institutionId, institutionId), eq(activities.id, id)),
    );
  return row;
}

async function ownMilestone(tx: Db, institutionId: string, id: string) {
  const [row] = await tx
    .select()
    .from(plannedMilestones)
    .where(
      and(
        eq(plannedMilestones.institutionId, institutionId),
        eq(plannedMilestones.id, id),
      ),
    );
  return row;
}

const riskFields = (input: z.infer<typeof riskRequestSchema>) => ({
  code: input.code,
  description: input.description,
  cause: input.cause,
  probability: input.probability,
  impact: input.impact,
});

@Controller('institutions/:institutionId')
@Roles('institution')
export class PlanEditorController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  private audit(
    tx: Tx,
    businessTime: string,
    user: User,
    action: string,
    institutionId: string,
    summary: string,
  ) {
    return this.events.audit(
      tx,
      businessTime,
      user,
      action,
      { type: 'plan', id: institutionId },
      summary,
    );
  }

  @Put('plan/approval')
  approval(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(planApprovalRequestSchema, body);
      if (input.approvedOn > businessTime.slice(0, 10))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          approvedOn: 'The approval date cannot be in the future.',
        });
      if (input.documentVersionId) {
        const [version] = await tx
          .select({ id: foundationVersions.id })
          .from(foundationVersions)
          .where(
            and(
              eq(foundationVersions.id, input.documentVersionId),
              eq(foundationVersions.institutionId, institutionId),
              eq(foundationVersions.kind, 'mitigation_plan'),
            ),
          );
        if (!version)
          throw new ApiError(
            422,
            'Some values need attention.',
            'invalid_plan',
            {
              documentVersionId: 'Choose one of your mitigation plan versions.',
            },
          );
      }
      const record = {
        ...input,
        recordedBy: user.displayName,
        recordedAt: businessTime,
      };
      await tx
        .insert(planApprovals)
        .values({ institutionId, ...record })
        .onConflictDoUpdate({
          target: planApprovals.institutionId,
          set: record,
        });
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.approval_record',
        institutionId,
        `${input.approvingBody}, ${input.approvedOn}: ${input.reference}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Post('risks')
  addRisk(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(riskRequestSchema, body);
      await duplicateCode(tx, risks, institutionId, input.code);
      await tx.insert(risks).values({
        id: await nextId(tx, 'risk'),
        institutionId,
        ...riskFields(input),
      });
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.risk_add',
        institutionId,
        `${input.code} ${input.description}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Put('risks/:riskId')
  updateRisk(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('riskId') riskId: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(riskRequestSchema, body);
      const risk = await ownRisk(tx, institutionId, riskId);
      if (!risk) throw notFound();
      await duplicateCode(tx, risks, institutionId, input.code, risk.id);
      await tx
        .update(risks)
        .set(riskFields(input))
        .where(eq(risks.id, risk.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.risk_update',
        institutionId,
        `${input.code} ${input.description}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Delete('risks/:riskId')
  removeRisk(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('riskId') riskId: string,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const risk = await ownRisk(tx, institutionId, riskId);
      if (!risk) throw notFound();
      const [used] = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.riskId, risk.id));
      if (used)
        throw new ApiError(
          409,
          `Activities treat ${risk.code}. Move or remove them first.`,
          'risk_in_use',
        );
      await tx.delete(risks).where(eq(risks.id, risk.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.risk_remove',
        institutionId,
        risk.code,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Post('activities')
  addActivity(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(activityRequestSchema, body);
      if (!(await ownRisk(tx, institutionId, input.riskId)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      await duplicateCode(tx, activities, institutionId, input.code);
      await tx
        .insert(activities)
        .values({ id: await nextId(tx, 'act'), institutionId, ...input });
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.activity_add',
        institutionId,
        `${input.code} ${input.title}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Put('activities/:activityId')
  updateActivity(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('activityId') activityId: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(activityRequestSchema, body);
      const activity = await ownActivity(tx, institutionId, activityId);
      if (!activity) throw notFound();
      if (!(await ownRisk(tx, institutionId, input.riskId)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      await duplicateCode(
        tx,
        activities,
        institutionId,
        input.code,
        activity.id,
      );
      await tx
        .update(activities)
        .set(input)
        .where(eq(activities.id, activity.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.activity_update',
        institutionId,
        `${input.code} ${input.title}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Delete('activities/:activityId')
  removeActivity(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('activityId') activityId: string,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const activity = await ownActivity(tx, institutionId, activityId);
      if (!activity) throw notFound();
      const [planned] = await tx
        .select({ id: plannedMilestones.id })
        .from(plannedMilestones)
        .where(eq(plannedMilestones.activityId, activity.id));
      const inBaseline = (
        await tx
          .select({ milestones: baselines.milestones })
          .from(baselines)
          .where(eq(baselines.institutionId, institutionId))
      ).some((row) =>
        row.milestones.some((item) => item.activityId === activity.id),
      );
      if (planned || inBaseline)
        throw new ApiError(
          409,
          `Milestones belong to ${activity.code}, in the plan or a baseline. It can be edited but not removed.`,
          'activity_in_use',
        );
      await tx.delete(activities).where(eq(activities.id, activity.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.activity_remove',
        institutionId,
        activity.code,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Post('plan-milestones')
  addMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(plannedMilestoneRequestSchema, body);
      if (!(await ownActivity(tx, institutionId, input.activityId)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      await requireOpenQuarter(tx, institutionId, input.periodId, businessTime);
      await duplicateCode(tx, plannedMilestones, institutionId, input.code);
      await tx
        .insert(plannedMilestones)
        .values({ id: await nextId(tx, 'pm'), institutionId, ...input });
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.milestone_add',
        institutionId,
        `${input.code} ${input.title}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Put('plan-milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(plannedMilestoneRequestSchema, body);
      const milestone = await ownMilestone(tx, institutionId, milestoneId);
      if (!milestone) throw notFound();
      if (!(await ownActivity(tx, institutionId, input.activityId)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      await requireOpenQuarter(
        tx,
        institutionId,
        milestone.periodId,
        businessTime,
      );
      await requireOpenQuarter(tx, institutionId, input.periodId, businessTime);
      await duplicateCode(
        tx,
        plannedMilestones,
        institutionId,
        input.code,
        milestone.id,
      );
      await tx
        .update(plannedMilestones)
        .set(input)
        .where(eq(plannedMilestones.id, milestone.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.milestone_update',
        institutionId,
        `${input.code} ${input.title}`,
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Delete('plan-milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('milestoneId') milestoneId: string,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const milestone = await ownMilestone(tx, institutionId, milestoneId);
      if (!milestone) throw notFound();
      await requireOpenQuarter(
        tx,
        institutionId,
        milestone.periodId,
        businessTime,
      );
      await tx
        .delete(plannedMilestones)
        .where(eq(plannedMilestones.id, milestone.id));
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.milestone_remove',
        institutionId,
        milestone.code,
      );
      return planFor(tx, user, institutionId);
    });
  }

  /** Copies the quarter's planned milestones, with both committee meetings, into a new version. */
  @Post('baselines/:periodId/propose')
  propose(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Param('periodId') periodId: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(proposeBaselineRequestSchema, body);
      const period = await requireOpenQuarter(
        tx,
        institutionId,
        periodId,
        businessTime,
      );
      const data = await planData(tx, institutionId);
      const current = latestOf(data.baselines, period.id);
      const milestones = proposedMilestones(data, institutionId, period);
      if (!milestones.some((milestone) => !milestone.mandatory))
        throw new ApiError(
          422,
          `Plan at least one milestone for ${period.label} before proposing its baseline.`,
          'empty_baseline',
        );
      if (
        current?.status === 'proposed' &&
        sameMilestones(current.milestones, milestones)
      )
        throw new ApiError(
          409,
          `The ${period.label} baseline is already proposed with these milestones.`,
          'already_proposed',
        );
      const version = (current?.version ?? 0) + 1;
      const proposalId = `bl-${institutionId}-${period.label}-v${version}`;
      await tx.insert(baselines).values({
        id: proposalId,
        institutionId,
        periodId: period.id,
        version,
        status: 'proposed',
        milestones,
        historicalSeed: null,
        approval: null,
        returned: null,
      });
      const substantive = milestones.filter(
        (milestone) => !milestone.mandatory,
      ).length;
      const note = input.note ? `. ${input.note}` : '';
      await this.events.audit(
        tx,
        businessTime,
        user,
        'baseline.propose',
        { type: 'baseline', id: proposalId, version },
        `${period.label}: ${substantive} planned milestones and the committee meetings${note}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${proposalId}:proposed`,
        'baseline.proposed',
        await assignedOfficers(tx, institutionId),
        {
          title: `Baseline proposed: ${institutionId} ${period.label}`,
          body: `${milestones.length} milestones are proposed for approval${input.note ? `: ${input.note}` : '.'}`,
          link: `/officer/institutions/${institutionId}`,
        },
      );
      return planFor(tx, user, institutionId);
    });
  }

  @Post('plan/import/preview')
  @HttpCode(200)
  async importPreview(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ) {
    const institutionId = ownPlan(user, id);
    const input = parse(planImportRequestSchema, body);
    return previewPlanImport(
      await this.importContext(this.db, institutionId),
      input.csv,
    ).preview;
  }

  // All or nothing, like the institution import: fix the file and run it again.
  @Post('plan/import')
  @HttpCode(200)
  import(
    @CurrentUser() user: User,
    @Param('institutionId') id: string,
    @Body() body: unknown,
  ): Promise<PlanImportResult> {
    return write(this.db, async (tx, businessTime) => {
      const institutionId = ownPlan(user, id);
      const input = parse(planImportRequestSchema, body);
      const { preview, rows } = previewPlanImport(
        await this.importContext(tx, institutionId),
        input.csv,
      );
      if (preview.fileErrors.length || preview.invalid)
        throw new ApiError(
          422,
          preview.fileErrors[0] ??
            `${preview.invalid} ${preview.invalid === 1 ? 'row needs' : 'rows need'} attention; nothing was imported.`,
          'import_invalid',
        );
      const counts = { risks: 0, activities: 0, milestones: 0 };
      const byCode = async (
        table: typeof risks | typeof activities | typeof plannedMilestones,
        code: string,
      ) =>
        (
          await tx
            .select({ id: table.id })
            .from(table)
            .where(
              and(eq(table.institutionId, institutionId), eq(table.code, code)),
            )
        )[0]?.id;
      for (const row of rows) {
        if (row.record !== 'risk') continue;
        const existing = await byCode(risks, row.input.code);
        if (existing)
          await tx
            .update(risks)
            .set(riskFields(row.input))
            .where(eq(risks.id, existing));
        else
          await tx.insert(risks).values({
            id: await nextId(tx, 'risk'),
            institutionId,
            ...riskFields(row.input),
          });
        counts.risks += 1;
      }
      for (const row of rows) {
        if (row.record !== 'activity') continue;
        const riskId = (await byCode(risks, row.link))!;
        const existing = await byCode(activities, row.input.code);
        if (existing)
          await tx
            .update(activities)
            .set({ ...row.input, riskId })
            .where(eq(activities.id, existing));
        else
          await tx.insert(activities).values({
            id: await nextId(tx, 'act'),
            institutionId,
            ...row.input,
            riskId,
          });
        counts.activities += 1;
      }
      for (const row of rows) {
        if (row.record !== 'milestone') continue;
        const activityId = (await byCode(activities, row.link))!;
        const existing = await byCode(plannedMilestones, row.input.code);
        if (existing)
          await tx
            .update(plannedMilestones)
            .set({ ...row.input, activityId })
            .where(eq(plannedMilestones.id, existing));
        else
          await tx.insert(plannedMilestones).values({
            id: await nextId(tx, 'pm'),
            institutionId,
            ...row.input,
            activityId,
          });
        counts.milestones += 1;
      }
      await this.audit(
        tx,
        businessTime,
        user,
        'plan.import',
        institutionId,
        `${counts.risks} risks, ${counts.activities} activities, ${counts.milestones} milestones`,
      );
      return counts;
    });
  }

  /** What an import is checked against: the plan so far and the quarters that are closed. */
  private async importContext(db: Db, institutionId: string) {
    const data = await planData(db, institutionId);
    const closed = new Set<string>();
    for (const period of data.cycle.periods)
      if (
        (await periodLocked(db, institutionId, period, data.businessTime)) ||
        latestOf(data.baselines, period.id)?.status === 'approved'
      )
        closed.add(period.id);
    return {
      risks: data.risks,
      activities: data.activities,
      plannedMilestones: data.planned,
      periods: data.cycle.periods,
      closedPeriodIds: closed,
    };
  }
}
