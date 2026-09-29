import {
  buildProposal,
  endOfDay,
  periodStartsAt,
  proposalDueAt as sharedDueAt,
  sameMilestones,
  type BaselineProposal,
  type Milestone,
  type Period,
} from '@cpi/contracts';
import type { MockDb } from '../db';

/**
 * The institution's plan (FR04): risks, activities and quarterly milestones it maintains, and
 * the proposal of each quarter's baseline from them. Officers approve baselines; institutions
 * own what goes into them.
 */

type Baseline = MockDb['baselines'][number];

export function latestBaseline(
  db: MockDb,
  institutionId: string,
  periodId: string,
): Baseline | undefined {
  return db.baselines
    .filter(
      (baseline) =>
        baseline.institutionId === institutionId &&
        baseline.periodId === periodId,
    )
    .sort((a, b) => b.version - a.version)[0];
}

/** Reporting opens when the quarter ends; from then its baseline is fixed (PRD §10.4). */
export function periodLocked(
  db: MockDb,
  institutionId: string,
  period: Period,
) {
  const obligation = db.obligations.find(
    (candidate) =>
      candidate.institutionId === institutionId &&
      candidate.periodId === period.id,
  );
  return (
    !obligation ||
    obligation.state !== 'not_started' ||
    Date.parse(db.businessTime) > Date.parse(endOfDay(period.endsOn))
  );
}

/** Proposals are due the configured number of counted days before the quarter starts. */
export const proposalDueAt = (db: MockDb, period: Period) =>
  sharedDueAt(period, db.cycle.dayCounting);

export { periodStartsAt, sameMilestones } from '@cpi/contracts';

/** The quarter's baseline as it would be proposed now: planned milestones plus committees. */
export function proposedMilestones(
  db: MockDb,
  institutionId: string,
  period: Period,
): Milestone[] {
  const own = <T extends { institutionId: string }>(items: T[]) =>
    items.filter((item) => item.institutionId === institutionId);
  return buildProposal({
    institutionId,
    period,
    planned: own(db.plannedMilestones).filter(
      (milestone) => milestone.periodId === period.id,
    ),
    activities: own(db.activities),
    risks: own(db.risks),
    existing: latestBaseline(db, institutionId, period.id)?.milestones,
  });
}

/** Whether the planned milestones differ from what the latest version holds. */
function changedSince(db: MockDb, institutionId: string, period: Period) {
  const baseline = latestBaseline(db, institutionId, period.id);
  if (!baseline) return false;
  return !sameMilestones(
    baseline.milestones,
    proposedMilestones(db, institutionId, period),
  );
}

export function proposalsFor(
  db: MockDb,
  institutionId: string,
): BaselineProposal[] {
  return db.cycle.periods.map((period) => {
    const baseline = latestBaseline(db, institutionId, period.id);
    return {
      periodId: period.id,
      periodLabel: period.label,
      dueAt: proposalDueAt(db, period),
      startsAt: periodStartsAt(period),
      status: baseline?.status ?? 'not_proposed',
      locked: periodLocked(db, institutionId, period),
      changedSinceProposal: changedSince(db, institutionId, period),
      plannedMilestones: db.plannedMilestones.filter(
        (milestone) =>
          milestone.institutionId === institutionId &&
          milestone.periodId === period.id,
      ).length,
    };
  });
}

/**
 * The next quarter the institution still has to propose, or revise and propose again: the
 * earliest one not yet locked whose latest baseline is missing or returned.
 */
export function nextProposal(db: MockDb, institutionId: string) {
  return proposalsFor(db, institutionId).find(
    (proposal) =>
      !proposal.locked &&
      (proposal.status === 'not_proposed' || proposal.status === 'returned'),
  );
}

/** Quarters already started whose baseline is still not approved, for supervisors. */
export function startedWithoutBaseline(db: MockDb, institutionIds: string[]) {
  const now = Date.parse(db.businessTime);
  return institutionIds.flatMap((institutionId) =>
    db.cycle.periods
      .filter(
        (period) =>
          Date.parse(periodStartsAt(period)) <= now &&
          !periodLocked(db, institutionId, period) &&
          latestBaseline(db, institutionId, period.id)?.status !== 'approved',
      )
      .map((period) => ({ institutionId, period })),
  );
}
