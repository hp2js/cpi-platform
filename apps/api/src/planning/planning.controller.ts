import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  amendmentDecisionSchema,
  amendmentRequestSchema,
  approveBaselineRequestSchema,
  confirmSeedRequestSchema,
  returnBaselineRequestSchema,
  type Baseline,
} from '@cpi/contracts';
import { assignedInstitutionIds, canReadInstitution } from '../auth/scope';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { nextId, write, type Db, type Tx } from '../database/db';
import {
  amendments,
  baselines,
  periods,
  plannedMilestones,
} from '../database/schema';
import { currentState } from '../database/state';
import { periodLocked, planFor, toBaseline, type BaselineRow } from './plans';
import { Events, assignedOfficers, institutionUsers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { latestBaseline } from '../reporting/report';

const reasonRequired = (code = 'reason_required') =>
  new ApiError(422, 'Give a reason of at least 10 characters.', code, {
    reason: 'Give a reason of at least 10 characters.',
  });

async function periodOf(db: Db, periodId: string) {
  const [period] = await db
    .select()
    .from(periods)
    .where(eq(periods.id, periodId));
  if (!period) throw new Error(`Unknown period ${periodId}`);
  return period;
}

/** A baseline locks once reporting opens on its period or any work has started (PRD §10.4). */
async function locked(db: Db, baseline: BaselineRow) {
  const { state } = await currentState(db);
  return periodLocked(
    db,
    baseline.institutionId,
    await periodOf(db, baseline.periodId),
    state.businessTime,
  );
}

async function toContract(db: Db, baseline: BaselineRow): Promise<Baseline> {
  return toBaseline(
    baseline,
    await periodOf(db, baseline.periodId),
    await locked(db, baseline),
  );
}

/** A new baseline version; the earlier version is kept (PRD §10.4). */
async function insertVersion(
  tx: Tx,
  baseline: BaselineRow,
  changes: Partial<BaselineRow>,
) {
  const label = (await periodOf(tx, baseline.periodId)).label;
  const [row] = await tx
    .insert(baselines)
    .values({
      ...baseline,
      id: `bl-${baseline.institutionId}-${label}-v${baseline.version + 1}`,
      version: baseline.version + 1,
      ...changes,
    })
    .returning();
  return row!;
}

/** Plan baselines, their approval and amendments (FR04, PRD §10.4, AT17, AT25, AT31). */
@Controller()
export class PlanningController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /** The latest version of a baseline, acted on by its assigned officer. */
  private async assignedBaseline(tx: Tx, user: User, baselineId: string) {
    const [baseline] = await tx
      .select()
      .from(baselines)
      .where(eq(baselines.id, baselineId));
    if (
      !baseline ||
      !(await canReadInstitution(tx, user, baseline.institutionId))
    )
      throw notFound();
    if (
      user.role !== 'officer' ||
      !(await assignedInstitutionIds(tx, user.id)).includes(
        baseline.institutionId,
      )
    )
      throw new ApiError(
        403,
        'Only the assigned officer can act on this baseline.',
        'forbidden',
      );
    return baseline;
  }

  private async requireLatest(tx: Tx, baseline: BaselineRow, version: number) {
    const latest = await latestBaseline(
      tx,
      baseline.institutionId,
      baseline.periodId,
    );
    if (latest?.version !== version || baseline.version !== version)
      throw new ApiError(
        409,
        'This baseline has a newer version. Reload before acting on it.',
        'version_conflict',
      );
  }

  @Get('institutions/:institutionId/plan')
  async plan(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
  ) {
    if (!(await canReadInstitution(this.db, user, institutionId)))
      throw notFound();
    return planFor(this.db, user, institutionId);
  }

  @Post('baselines/:baselineId/approve')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  approve(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const baseline = await this.assignedBaseline(tx, user, id);
      const parsed = approveBaselineRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'Confirm every approval check and give a rationale of at least 20 characters.',
          'approval_incomplete',
          { rationale: 'Give a rationale of at least 20 characters.' },
        );
      await this.requireLatest(tx, baseline, parsed.data.version);
      if (baseline.status === 'approved')
        throw new ApiError(
          409,
          'This baseline is already approved.',
          'already_approved',
        );
      if (baseline.milestones.length === 0)
        throw new ApiError(
          422,
          'An empty baseline cannot be approved; it would give automatic full credit.',
          'empty_baseline',
        );
      if (
        baseline.milestones.filter((milestone) => milestone.mandatory).length <
        2
      )
        throw new ApiError(
          422,
          'The baseline must include both the CPC and IAO meeting obligations.',
          'mandatory_missing',
        );
      const [approved] = await tx
        .update(baselines)
        .set({
          status: 'approved',
          returned: null,
          approval: {
            by: user.displayName,
            at: businessTime,
            rationale: parsed.data.rationale.trim(),
            checks: parsed.data.checks,
          },
        })
        .where(eq(baselines.id, id))
        .returning();
      const label = (await periodOf(tx, baseline.periodId)).label;
      await this.events.audit(
        tx,
        businessTime,
        user,
        'baseline.approve',
        { type: 'baseline', id, version: baseline.version },
        `${baseline.institutionId} ${label}: ${baseline.milestones.length} milestones`,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${id}:approved`,
        'baseline.approved',
        await institutionUsers(tx, baseline.institutionId),
        {
          title: `${label} baseline approved`,
          body: `Your officer approved ${baseline.milestones.length} milestones for ${label}.`,
          link: '/institution/plan',
        },
      );
      return toContract(tx, approved!);
    });
  }

  @Post('baselines/:baselineId/return')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  returnBaseline(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const baseline = await this.assignedBaseline(tx, user, id);
      const parsed = returnBaselineRequestSchema.safeParse(body);
      if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path[0]);
        throw new ApiError(
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
      await this.requireLatest(tx, baseline, parsed.data.version);
      if (baseline.status !== 'proposed')
        throw new ApiError(
          409,
          'Only a proposed baseline can be returned.',
          'not_proposed',
        );
      const reason = parsed.data.reason.trim();
      const [returned] = await tx
        .update(baselines)
        .set({
          status: 'returned',
          returned: {
            by: user.displayName,
            at: businessTime,
            reason,
            failedChecks: parsed.data.failedChecks,
          },
        })
        .where(eq(baselines.id, id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'baseline.return',
        { type: 'baseline', id, version: baseline.version },
        reason,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${id}:returned`,
        'baseline.returned',
        await institutionUsers(tx, baseline.institutionId),
        {
          title: `${(await periodOf(tx, baseline.periodId)).label} baseline returned for revision`,
          body: `Your officer returned the proposed baseline: ${reason}`,
          link: '/institution/plan',
        },
      );
      return toContract(tx, returned!);
    });
  }

  @Post('baselines/:baselineId/confirm-seed')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  confirmSeed(
    @CurrentUser() user: User,
    @Param('baselineId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const baseline = await this.assignedBaseline(tx, user, id);
      const parsed = confirmSeedRequestSchema.safeParse(body);
      if (!parsed.success)
        throw new ApiError(
          422,
          'The request is missing its version.',
          'invalid_request',
        );
      await this.requireLatest(tx, baseline, parsed.data.version);
      if (!baseline.historicalSeed)
        throw new ApiError(
          409,
          'This is not a seeded historical baseline.',
          'not_seeded',
        );
      if (baseline.historicalSeed.confirmedAt)
        throw new ApiError(409, 'Already confirmed.', 'already_confirmed');
      // Actual confirmation time is recorded; nothing is backdated (PRD §10.4).
      const [confirmed] = await tx
        .update(baselines)
        .set({
          historicalSeed: {
            ...baseline.historicalSeed,
            confirmedBy: user.displayName,
            confirmedAt: businessTime,
          },
        })
        .where(eq(baselines.id, id))
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'baseline.confirm_seed',
        { type: 'baseline', id, version: baseline.version },
        'Confirmed correspondence with the fictional approved plan',
      );
      return toContract(tx, confirmed!);
    });
  }

  @Post('institutions/:institutionId/amendments')
  @Roles('institution')
  requestAmendment(
    @CurrentUser() user: User,
    @Param('institutionId') institutionId: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      if (user.institutionId !== institutionId) throw notFound();
      const parsed = amendmentRequestSchema.safeParse(body);
      if (!parsed.success) throw reasonRequired('invalid_amendment');
      const baseline = await latestBaseline(
        tx,
        institutionId,
        parsed.data.periodId,
      );
      const milestone = baseline?.milestones.find(
        (candidate) => candidate.id === parsed.data.milestoneId,
      );
      if (!baseline || !milestone) throw notFound();
      // No retrospective change: an opened or started period keeps its denominator (AT17).
      if (await locked(tx, baseline))
        throw new ApiError(
          409,
          'Reporting has opened for this period, so its baseline can no longer change.',
          'baseline_locked',
        );
      // Until approval, the institution changes its plan and proposes again instead.
      if (baseline.status !== 'approved')
        throw new ApiError(
          409,
          'This baseline is not approved yet. Change the planned milestones and propose it again.',
          'baseline_not_approved',
        );
      if (milestone.mandatory)
        throw new ApiError(
          422,
          'Committee meeting obligations cannot be removed or moved by the institution.',
          'mandatory_milestone',
        );
      const period = await periodOf(tx, baseline.periodId);
      if (parsed.data.change === 'reschedule') {
        const target = parsed.data.toPeriodId
          ? await latestBaseline(tx, institutionId, parsed.data.toPeriodId)
          : undefined;
        if (
          !target ||
          (await periodOf(tx, target.periodId)).quarter <= period.quarter ||
          (await locked(tx, target))
        )
          throw new ApiError(
            422,
            'Choose a later period whose reporting has not opened.',
            'invalid_target',
            { toPeriodId: 'Choose a later, unopened period.' },
          );
      }
      const [pending] = await tx
        .select({ id: amendments.id })
        .from(amendments)
        .where(
          and(
            eq(amendments.milestoneId, milestone.id),
            eq(amendments.status, 'pending'),
          ),
        );
      if (pending)
        throw new ApiError(
          409,
          'An amendment for this milestone is already awaiting your officer.',
          'amendment_pending',
        );
      const [amendment] = await tx
        .insert(amendments)
        .values({
          id: await nextId(tx, 'amd'),
          institutionId,
          periodId: baseline.periodId,
          milestoneId: milestone.id,
          milestoneCode: milestone.code,
          change: parsed.data.change,
          toPeriodId:
            parsed.data.change === 'reschedule' ? parsed.data.toPeriodId : null,
          reason: parsed.data.reason.trim(),
          status: 'pending',
          requestedBy: user.displayName,
          requestedAt: businessTime,
        })
        .returning();
      await this.events.audit(
        tx,
        businessTime,
        user,
        'amendment.request',
        { type: 'amendment', id: amendment!.id },
        `${amendment!.change} ${milestone.code}: ${amendment!.reason}`,
      );
      await this.events.notify(
        tx,
        businessTime,
        amendment!.id,
        'amendment.requested',
        await assignedOfficers(tx, institutionId),
        {
          title: `Baseline amendment requested: ${institutionId}`,
          body: `${institutionId} asks to ${amendment!.change} ${milestone.code} in ${period.label}.`,
          link: `/officer/institutions/${institutionId}`,
        },
      );
      const { seq, ...contract } = amendment!;
      return contract;
    });
  }

  @Post('amendments/:amendmentId/decision')
  @HttpCode(200)
  @Roles('officer', 'supervisor', 'administrator')
  decideAmendment(
    @CurrentUser() user: User,
    @Param('amendmentId') id: string,
    @Body() body: unknown,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const [amendment] = await tx
        .select()
        .from(amendments)
        .where(eq(amendments.id, id));
      if (
        !amendment ||
        !(await canReadInstitution(tx, user, amendment.institutionId))
      )
        throw notFound();
      if (
        user.role !== 'officer' ||
        !(await assignedInstitutionIds(tx, user.id)).includes(
          amendment.institutionId,
        )
      )
        throw new ApiError(
          403,
          'Only the assigned officer can decide amendments.',
          'forbidden',
        );
      const parsed = amendmentDecisionSchema.safeParse(body);
      if (!parsed.success) throw reasonRequired();
      if (amendment.status !== 'pending')
        throw new ApiError(
          409,
          'This amendment has already been decided.',
          'already_decided',
        );
      const source = (await latestBaseline(
        tx,
        amendment.institutionId,
        amendment.periodId,
      ))!;
      const confirmed = parsed.data.decision === 'confirmed';
      if (confirmed && (await locked(tx, source)))
        throw new ApiError(
          409,
          'Reporting has opened for this period; the amendment can no longer apply.',
          'baseline_locked',
        );
      const reason = parsed.data.reason.trim();
      await tx
        .update(amendments)
        .set({
          status: parsed.data.decision,
          decidedBy: user.displayName,
          decidedAt: businessTime,
          decisionReason: reason,
        })
        .where(eq(amendments.id, id));
      if (confirmed) {
        // A new version for each affected period; the original baseline is retained.
        const moved = source.milestones.find(
          (milestone) => milestone.id === amendment.milestoneId,
        )!;
        const approval = (baseline: BaselineRow) =>
          baseline.approval && {
            ...baseline.approval,
            by: user.displayName,
            at: businessTime,
            rationale: `Amendment ${amendment.id} confirmed: ${amendment.reason}`,
          };
        await insertVersion(tx, source, {
          milestones: source.milestones.filter(
            (milestone) => milestone.id !== moved.id,
          ),
          approval: approval(source),
        });
        if (amendment.change === 'reschedule' && amendment.toPeriodId) {
          const target = (await latestBaseline(
            tx,
            amendment.institutionId,
            amendment.toPeriodId,
          ))!;
          await insertVersion(tx, target, {
            milestones: [...target.milestones, moved],
            approval: approval(target),
          });
        }
        // The plan follows the confirmed change, so a later proposal does not undo it.
        if (amendment.change === 'reschedule' && amendment.toPeriodId)
          await tx
            .update(plannedMilestones)
            .set({ periodId: amendment.toPeriodId })
            .where(eq(plannedMilestones.id, moved.id));
        else
          await tx
            .delete(plannedMilestones)
            .where(eq(plannedMilestones.id, moved.id));
      }
      await this.events.audit(
        tx,
        businessTime,
        user,
        `amendment.${parsed.data.decision}`,
        { type: 'amendment', id },
        reason,
      );
      await this.events.notify(
        tx,
        businessTime,
        `${id}:decided`,
        'amendment.decided',
        await institutionUsers(tx, amendment.institutionId),
        {
          title: `Baseline amendment ${parsed.data.decision}`,
          body: `Your request to ${amendment.change} ${amendment.milestoneCode} was ${parsed.data.decision}.`,
          link: '/institution/plan',
        },
      );
      return planFor(tx, user, amendment.institutionId);
    });
  }
}
