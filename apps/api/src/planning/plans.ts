import { and, asc, eq } from 'drizzle-orm';
import {
  buildProposal,
  periodEnded,
  periodStartsAt,
  proposalDueAt,
  sameMilestones,
  type Baseline,
  type BaselineProposal,
  type Milestone,
  type Period,
  type Plan,
} from '@cpi/contracts';
import type { User } from '../auth/sessions';
import type { Db } from '../database/db';
import {
  activities,
  amendments,
  baselines,
  institutions,
  obligations,
  planApprovals,
  plannedMilestones,
  risks,
} from '../database/schema';
import { currentState, loadCycle } from '../database/state';

/*
 * The institution's plan (FR04), ported from the mock API's services/plans.ts: risks,
 * activities and quarterly milestones it maintains, and the proposal of each quarter's
 * baseline from them. The rules themselves are shared in @cpi/contracts.
 */

export type BaselineRow = typeof baselines.$inferSelect;

/** Rows written before the plan editor may lack newer fields; read them in contract shape. */
export const normalizeMilestones = (milestones: Milestone[]) =>
  milestones.map((milestone) => ({
    ...milestone,
    activityId: milestone.activityId ?? null,
  }));

export function toBaseline(
  baseline: BaselineRow,
  period: Period,
  locked: boolean,
): Baseline {
  return {
    ...baseline,
    milestones: normalizeMilestones(baseline.milestones),
    returned: baseline.returned && {
      ...baseline.returned,
      failedChecks: baseline.returned.failedChecks ?? [],
    },
    periodLabel: period.label,
    locked,
  };
}

/** Reporting opens when the quarter ends, or work has started; then the baseline is fixed. */
export async function periodLocked(
  db: Db,
  institutionId: string,
  period: Period,
  businessTime: string,
) {
  const [obligation] = await db
    .select({ state: obligations.state })
    .from(obligations)
    .where(
      and(
        eq(obligations.institutionId, institutionId),
        eq(obligations.periodId, period.id),
      ),
    );
  return (
    !obligation ||
    obligation.state !== 'not_started' ||
    periodEnded(period, businessTime)
  );
}

export function latestOf(rows: BaselineRow[], periodId: string) {
  return rows
    .filter((row) => row.periodId === periodId)
    .sort((a, b) => b.version - a.version)[0];
}

/** Everything a plan read or proposal needs for one institution. */
export async function planData(db: Db, institutionId: string) {
  const [cycle, { state }, riskRows, activityRows, plannedRows, baselineRows] =
    await Promise.all([
      loadCycle(db),
      currentState(db),
      db
        .select()
        .from(risks)
        .where(eq(risks.institutionId, institutionId))
        .orderBy(asc(risks.code)),
      db
        .select()
        .from(activities)
        .where(eq(activities.institutionId, institutionId))
        .orderBy(asc(activities.code)),
      db
        .select()
        .from(plannedMilestones)
        .where(eq(plannedMilestones.institutionId, institutionId))
        .orderBy(asc(plannedMilestones.periodId), asc(plannedMilestones.code)),
      db
        .select()
        .from(baselines)
        .where(eq(baselines.institutionId, institutionId))
        .orderBy(asc(baselines.periodId), asc(baselines.version)),
    ]);
  return {
    cycle,
    businessTime: state.businessTime,
    risks: riskRows,
    activities: activityRows,
    planned: plannedRows,
    baselines: baselineRows,
  };
}

export type PlanData = Awaited<ReturnType<typeof planData>>;

/** The quarter's baseline as it would be proposed now: planned milestones plus committees. */
export function proposedMilestones(
  data: PlanData,
  institutionId: string,
  period: Period,
): Milestone[] {
  return buildProposal({
    institutionId,
    period,
    planned: data.planned.filter((row) => row.periodId === period.id),
    activities: data.activities,
    risks: data.risks,
    existing: latestOf(data.baselines, period.id)?.milestones,
  });
}

export async function proposalsFor(
  db: Db,
  data: PlanData,
  institutionId: string,
): Promise<BaselineProposal[]> {
  return Promise.all(
    data.cycle.periods.map(async (period) => {
      const baseline = latestOf(data.baselines, period.id);
      return {
        periodId: period.id,
        periodLabel: period.label,
        dueAt: proposalDueAt(period, data.cycle.dayCounting),
        startsAt: periodStartsAt(period),
        status: baseline?.status ?? 'not_proposed',
        locked: await periodLocked(
          db,
          institutionId,
          period,
          data.businessTime,
        ),
        changedSinceProposal: baseline
          ? !sameMilestones(
              normalizeMilestones(baseline.milestones),
              proposedMilestones(data, institutionId, period),
            )
          : false,
        plannedMilestones: data.planned.filter(
          (row) => row.periodId === period.id,
        ).length,
      };
    }),
  );
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const longDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]} ${year}`;
};

export async function planFor(
  db: Db,
  user: User,
  institutionId: string,
): Promise<Plan> {
  const data = await planData(db, institutionId);
  const [[institution], [record], amendmentRows] = await Promise.all([
    db
      .select({ name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, institutionId)),
    db
      .select()
      .from(planApprovals)
      .where(eq(planApprovals.institutionId, institutionId)),
    db
      .select()
      .from(amendments)
      .where(eq(amendments.institutionId, institutionId))
      .orderBy(asc(amendments.seq)),
  ]);
  const periodOf = (periodId: string) =>
    data.cycle.periods.find((period) => period.id === periodId)!;
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
    institutionName: institution?.name ?? institutionId,
    approvedPlanReference: approval
      ? `${approval.reference}, approved by the ${approval.approvingBody} on ${longDate(approval.approvedOn)}`
      : 'No plan approval recorded yet',
    approval,
    risks: data.risks.map((risk) => ({
      id: risk.id,
      code: risk.code,
      description: risk.description,
      cause: risk.cause,
      probability: risk.probability,
      impact: risk.impact,
      severity: risk.probability * risk.impact,
    })),
    activities: data.activities.map(
      ({ institutionId: _institution, ...activity }) => activity,
    ),
    plannedMilestones: data.planned.map(
      ({ institutionId: _institution, ...milestone }) => milestone,
    ),
    proposals: await proposalsFor(db, data, institutionId),
    baselines: await Promise.all(
      data.baselines.map(async (baseline) => {
        const period = periodOf(baseline.periodId);
        return toBaseline(
          baseline,
          period,
          await periodLocked(db, institutionId, period, data.businessTime),
        );
      }),
    ),
    amendments: amendmentRows.map(({ seq: _seq, ...amendment }) => amendment),
    editable:
      user.role === 'institution' && user.institutionId === institutionId,
  };
}
