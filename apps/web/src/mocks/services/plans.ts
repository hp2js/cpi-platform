import type { BaselineProposal, Milestone, Period } from '@cpi/contracts';
import type { MockDb } from '../db';
import { committee, committeeCodes } from '../seed/baselines';
import { endOfDay, shiftDays } from './days';

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
export function proposalDueAt(db: MockDb, period: Period) {
  return endOfDay(
    shiftDays(
      period.startsOn,
      -db.cycle.dayCounting.proposalLeadDays,
      db.cycle.dayCounting,
    ),
  );
}

export const periodStartsAt = (period: Period) =>
  `${period.startsOn}T00:00:00+03:00`;

/** The quarter's baseline as it would be proposed now: planned milestones plus committees. */
export function proposedMilestones(
  db: MockDb,
  institutionId: string,
  period: Period,
): Milestone[] {
  const planned = db.plannedMilestones.filter(
    (milestone) =>
      milestone.institutionId === institutionId &&
      milestone.periodId === period.id,
  );
  const substantive = planned
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((milestone): Milestone => {
      const activity = db.activities.find(
        (candidate) => candidate.id === milestone.activityId,
      );
      const risk = db.risks.find(
        (candidate) => candidate.id === activity?.riskId,
      );
      return {
        id: milestone.id,
        code: milestone.code,
        title: milestone.title,
        activity: activity ? `${activity.code} ${activity.title}` : '',
        risk: risk ? `${risk.code} ${risk.description}` : '',
        activityId: milestone.activityId,
        completionCondition: milestone.completionCondition,
        evidenceExpectation: milestone.evidenceExpectation,
        weight: 1,
        mandatory: false,
      };
    });
  // Keep the committee milestones a quarter already has, so their identifiers stay stable.
  const existing = latestBaseline(
    db,
    institutionId,
    period.id,
  )?.milestones.filter((milestone) => milestone.mandatory);
  const committees =
    existing && existing.length >= 2
      ? existing
      : committee(institutionId, ...committeeCodes(period.quarter));
  return [...substantive, ...committees];
}

/** What makes two versions' planned milestones the same, ignoring order. */
export function sameMilestones(a: Milestone[], b: Milestone[]) {
  const signature = (milestones: Milestone[]) =>
    JSON.stringify(
      milestones
        .filter((milestone) => !milestone.mandatory)
        .map((milestone) => [
          milestone.id,
          milestone.code,
          milestone.title,
          milestone.activityId,
          milestone.completionCondition,
          milestone.evidenceExpectation,
        ])
        .sort(),
    );
  return signature(a) === signature(b);
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
