import { Inject, Injectable } from '@nestjs/common';
import {
  previewPlanImport,
  sameMilestones,
  type PlanImportResult,
  type ActivityRequest,
  type PlanApprovalRequest,
  type PlanImportRequest,
  type PlannedMilestoneRequest,
  type ProposeBaselineRequest,
  type RiskRequest,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import {
  DB,
  nextId,
  write,
  type Database,
  type Db,
  type Tx,
} from '../database/db';
import { loadCycle } from '../database/state';
import { Events, assignedOfficers } from '../events/events';
import { ApiError, notFound } from '../http/api-error';
import {
  PlanEditorRepository,
  type CodedRecord,
} from './plan-editor.repository';
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
 * own focal persons edit it (OwnInstitutionGuard); officers read it and approve or return the
 * proposals. Ported from the mock API's handlers/plan-editor.ts.
 */

const riskFields = (input: RiskRequest) => ({
  code: input.code,
  description: input.description,
  cause: input.cause,
  probability: input.probability,
  impact: input.impact,
});

@Injectable()
export class PlanEditorService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: PlanEditorRepository,
    private readonly events: Events,
  ) {}

  /** Codes are unique per institution and kind; `except` is the record being edited. */
  private async duplicateCode(
    tx: Tx,
    kind: CodedRecord,
    institutionId: string,
    code: string,
    except?: string,
  ) {
    const ids = await this.repository.idsByCode(kind, institutionId, code, tx);
    // The code passed the code pattern, so repeating it back is safe.
    if (ids.some((id) => id !== except))
      throw new ApiError(
        422,
        `${code} is already in the plan.`,
        'duplicate_code',
        { code: `${code} is already in the plan. Use another code.` },
      );
  }

  /**
   * A quarter's planned milestones change only while its baseline is open to proposal: not yet
   * approved and not locked. After approval, changes go through amendments (PRD §10.4).
   */
  private async requireOpenQuarter(
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
    if (
      (await this.repository.latestBaselineStatus(
        institutionId,
        period.id,
        tx,
      )) === 'approved'
    )
      throw new ApiError(
        409,
        `The ${period.label} baseline is approved. Request an amendment to change it.`,
        'baseline_approved',
      );
    return period;
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

  approval(user: User, institutionId: string, input: PlanApprovalRequest) {
    return write(this.db, async (tx, businessTime) => {
      if (input.approvedOn > businessTime.slice(0, 10))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          approvedOn: 'The approval date cannot be in the future.',
        });
      if (
        input.documentVersionId &&
        !(await this.repository.hasMitigationPlanVersion(
          input.documentVersionId,
          institutionId,
          tx,
        ))
      )
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          documentVersionId: 'Choose one of your mitigation plan versions.',
        });
      const record = {
        ...input,
        recordedBy: user.displayName,
        recordedAt: businessTime,
      };
      await this.repository.savePlanApproval({ institutionId, ...record }, tx);
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

  addRisk(user: User, institutionId: string, input: RiskRequest) {
    return write(this.db, async (tx, businessTime) => {
      await this.duplicateCode(tx, 'risk', institutionId, input.code);
      await this.repository.insertRisk(
        {
          id: await nextId(tx, 'risk'),
          institutionId,
          ...riskFields(input),
        },
        tx,
      );
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

  updateRisk(
    user: User,
    institutionId: string,
    riskId: string,
    input: RiskRequest,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const risk = await this.repository.risk(institutionId, riskId, tx);
      if (!risk) throw notFound();
      await this.duplicateCode(tx, 'risk', institutionId, input.code, risk.id);
      await this.repository.updateRisk(risk.id, riskFields(input), tx);
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

  removeRisk(user: User, institutionId: string, riskId: string) {
    return write(this.db, async (tx, businessTime) => {
      const risk = await this.repository.risk(institutionId, riskId, tx);
      if (!risk) throw notFound();
      if (await this.repository.riskInUse(risk.id, tx))
        throw new ApiError(
          409,
          `Activities treat ${risk.code}. Move or remove them first.`,
          'risk_in_use',
        );
      await this.repository.deleteRisk(risk.id, tx);
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

  addActivity(user: User, institutionId: string, input: ActivityRequest) {
    return write(this.db, async (tx, businessTime) => {
      if (!(await this.repository.risk(institutionId, input.riskId, tx)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      await this.duplicateCode(tx, 'activity', institutionId, input.code);
      await this.repository.insertActivity(
        { id: await nextId(tx, 'act'), institutionId, ...input },
        tx,
      );
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

  updateActivity(
    user: User,
    institutionId: string,
    activityId: string,
    input: ActivityRequest,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const activity = await this.repository.activity(
        institutionId,
        activityId,
        tx,
      );
      if (!activity) throw notFound();
      if (!(await this.repository.risk(institutionId, input.riskId, tx)))
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          riskId: 'Choose the risk this activity treats.',
        });
      await this.duplicateCode(
        tx,
        'activity',
        institutionId,
        input.code,
        activity.id,
      );
      await this.repository.updateActivity(activity.id, input, tx);
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

  removeActivity(user: User, institutionId: string, activityId: string) {
    return write(this.db, async (tx, businessTime) => {
      const activity = await this.repository.activity(
        institutionId,
        activityId,
        tx,
      );
      if (!activity) throw notFound();
      const planned = await this.repository.activityHasPlannedMilestones(
        activity.id,
        tx,
      );
      const inBaseline = await this.repository.activityInBaseline(
        institutionId,
        activity.id,
        tx,
      );
      if (planned || inBaseline)
        throw new ApiError(
          409,
          `Milestones belong to ${activity.code}, in the plan or a baseline. It can be edited but not removed.`,
          'activity_in_use',
        );
      await this.repository.deleteActivity(activity.id, tx);
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

  addMilestone(
    user: User,
    institutionId: string,
    input: PlannedMilestoneRequest,
  ) {
    return write(this.db, async (tx, businessTime) => {
      if (
        !(await this.repository.activity(institutionId, input.activityId, tx))
      )
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      await this.requireOpenQuarter(
        tx,
        institutionId,
        input.periodId,
        businessTime,
      );
      await this.duplicateCode(tx, 'milestone', institutionId, input.code);
      await this.repository.insertMilestone(
        { id: await nextId(tx, 'pm'), institutionId, ...input },
        tx,
      );
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

  updateMilestone(
    user: User,
    institutionId: string,
    milestoneId: string,
    input: PlannedMilestoneRequest,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const milestone = await this.repository.milestone(
        institutionId,
        milestoneId,
        tx,
      );
      if (!milestone) throw notFound();
      if (
        !(await this.repository.activity(institutionId, input.activityId, tx))
      )
        throw new ApiError(422, 'Some values need attention.', 'invalid_plan', {
          activityId: 'Choose the activity this milestone belongs to.',
        });
      await this.requireOpenQuarter(
        tx,
        institutionId,
        milestone.periodId,
        businessTime,
      );
      await this.requireOpenQuarter(
        tx,
        institutionId,
        input.periodId,
        businessTime,
      );
      await this.duplicateCode(
        tx,
        'milestone',
        institutionId,
        input.code,
        milestone.id,
      );
      await this.repository.updateMilestone(milestone.id, input, tx);
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

  removeMilestone(user: User, institutionId: string, milestoneId: string) {
    return write(this.db, async (tx, businessTime) => {
      const milestone = await this.repository.milestone(
        institutionId,
        milestoneId,
        tx,
      );
      if (!milestone) throw notFound();
      await this.requireOpenQuarter(
        tx,
        institutionId,
        milestone.periodId,
        businessTime,
      );
      await this.repository.deleteMilestone(milestone.id, tx);
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
  propose(
    user: User,
    institutionId: string,
    periodId: string,
    input: ProposeBaselineRequest,
  ) {
    return write(this.db, async (tx, businessTime) => {
      const period = await this.requireOpenQuarter(
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
      await this.repository.insertBaseline(
        {
          id: proposalId,
          institutionId,
          periodId: period.id,
          version,
          status: 'proposed',
          milestones,
          historicalSeed: null,
          approval: null,
          returned: null,
        },
        tx,
      );
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

  async importPreview(institutionId: string, input: PlanImportRequest) {
    return previewPlanImport(
      await this.importContext(this.db, institutionId),
      input.csv,
    ).preview;
  }

  // All or nothing, like the institution import: fix the file and run it again.
  import(
    user: User,
    institutionId: string,
    input: PlanImportRequest,
  ): Promise<PlanImportResult> {
    return write(this.db, async (tx, businessTime) => {
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
      const byCode = async (kind: CodedRecord, code: string) =>
        (await this.repository.idsByCode(kind, institutionId, code, tx))[0];
      for (const row of rows) {
        if (row.record !== 'risk') continue;
        const existing = await byCode('risk', row.input.code);
        if (existing)
          await this.repository.updateRisk(existing, riskFields(row.input), tx);
        else
          await this.repository.insertRisk(
            {
              id: await nextId(tx, 'risk'),
              institutionId,
              ...riskFields(row.input),
            },
            tx,
          );
        counts.risks += 1;
      }
      for (const row of rows) {
        if (row.record !== 'activity') continue;
        const riskId = (await byCode('risk', row.link))!;
        const existing = await byCode('activity', row.input.code);
        if (existing)
          await this.repository.updateActivity(
            existing,
            { ...row.input, riskId },
            tx,
          );
        else
          await this.repository.insertActivity(
            {
              id: await nextId(tx, 'act'),
              institutionId,
              ...row.input,
              riskId,
            },
            tx,
          );
        counts.activities += 1;
      }
      for (const row of rows) {
        if (row.record !== 'milestone') continue;
        const activityId = (await byCode('activity', row.link))!;
        const existing = await byCode('milestone', row.input.code);
        if (existing)
          await this.repository.updateMilestone(
            existing,
            { ...row.input, activityId },
            tx,
          );
        else
          await this.repository.insertMilestone(
            {
              id: await nextId(tx, 'pm'),
              institutionId,
              ...row.input,
              activityId,
            },
            tx,
          );
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
