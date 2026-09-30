import { inArray } from 'drizzle-orm';
import { localDate, periodStartsAt, shiftDays } from '@cpi/contracts';
import { accountStatus } from '../auth/passwords';
import {
  assignedInstitutionIds,
  supervisedInstitutionIds,
} from '../auth/scope';
import type { Tx } from '../database/db';
import {
  baselines,
  clarifications,
  obligations,
  users,
} from '../database/schema';
import { loadCycle } from '../database/state';
import { isReviewOverdue, reviewDueAt } from '../directory/obligations';
import { usersWithRole, type Events } from '../events/events';
import { latestOf, periodLocked } from '../planning/plans';
import { toClarifications } from '../review/clarifications';

/*
 * Oversight and officer digests (PRD §4.1, G4), ported from the mock API's services/clock.ts.
 * A live system would send them daily; the demo sends one per clock move, keyed by the last
 * new boundary crossed, so a replayed move never repeats them.
 */

/** Days ahead that an unapproved baseline starts to matter: its quarter opens soon (PRD §10.4). */
const BASELINE_LOOKAHEAD_DAYS = 14;
/** Days ahead that a review nearing the officer review target is mentioned. */
const REVIEW_WARNING_DAYS = 2;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
const some = (ids: string[]) =>
  `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''}`;

/** Everything both digests read, for the institutions in one person's scope. */
async function scopeData(tx: Tx, scope: string[]) {
  if (scope.length === 0)
    return { obligations: [], clarifications: [], baselines: [], focal: [] };
  const [obligationRows, clarificationRows, baselineRows, focalRows] =
    await Promise.all([
      tx
        .select()
        .from(obligations)
        .where(inArray(obligations.institutionId, scope)),
      tx
        .select()
        .from(clarifications)
        .where(inArray(clarifications.institutionId, scope)),
      tx
        .select()
        .from(baselines)
        .where(inArray(baselines.institutionId, scope)),
      tx.select().from(users).where(inArray(users.institutionId, scope)),
    ]);
  return {
    obligations: obligationRows,
    clarifications: await toClarifications(tx, clarificationRows),
    baselines: baselineRows,
    focal: focalRows.filter(
      (user) =>
        user.role === 'institution' &&
        user.active &&
        accountStatus(user) === 'active',
    ),
  };
}

export async function sendDigests(
  tx: Tx,
  events: Events,
  key: string,
  businessTime: string,
) {
  const cycle = await loadCycle(tx);
  const now = Date.parse(businessTime);
  const rule = cycle.dayCounting;
  const unreachableOf = (
    scope: string[],
    focal: Awaited<ReturnType<typeof scopeData>>['focal'],
  ) =>
    scope.filter(
      (institutionId) =>
        !focal.some((user) => user.institutionId === institutionId),
    );

  for (const supervisor of await usersWithRole(tx, 'supervisor')) {
    const scope = await supervisedInstitutionIds(tx, supervisor.id);
    const data = await scopeData(tx, scope);
    const missing = data.obligations.filter((obligation) => {
      const period = cycle.periods.find(
        (candidate) => candidate.id === obligation.periodId,
      )!;
      return (
        (obligation.state === 'not_started' || obligation.state === 'draft') &&
        Date.parse(period.submissionDeadline) < now
      );
    });
    const reviews = data.obligations.filter((obligation) =>
      isReviewOverdue(obligation, businessTime, rule),
    );
    const overdue = data.clarifications.filter((item) => item.overdue);
    const extensions = new Set(
      data.clarifications
        .filter((item) => item.extensionRequired)
        .map((item) => item.institutionId),
    );
    const unreachable = unreachableOf(scope, data.focal);
    // A quarter under way without an approved baseline has nothing to report against.
    const noBaseline: string[] = [];
    for (const institutionId of scope)
      for (const period of cycle.periods)
        if (
          Date.parse(periodStartsAt(period)) <= now &&
          !(await periodLocked(tx, institutionId, period, businessTime)) &&
          latestOf(
            data.baselines.filter((row) => row.institutionId === institutionId),
            period.id,
          )?.status !== 'approved'
        )
          noBaseline.push(`${institutionId} ${period.label}`);
    const lines = [
      missing.length &&
        `${plural(missing.length, 'report', 'reports')} missing after the deadline`,
      reviews.length &&
        `${plural(reviews.length, 'review', 'reviews')} past the officer review target (${rule.reviewTargetDays} ${rule.mode === 'working' ? 'working ' : ''}days)`,
      overdue.length &&
        `${plural(overdue.length, 'clarification', 'clarifications')} past the response window`,
      extensions.size &&
        `${plural(extensions.size, 'institution needs', 'institutions need')} an extension decision`,
      unreachable.length &&
        `${plural(unreachable.length, 'institution has', 'institutions have')} no active focal person (${some(unreachable)})`,
      noBaseline.length &&
        `${plural(noBaseline.length, 'quarter has', 'quarters have')} started without an approved baseline (${some(noBaseline)})`,
    ].filter(Boolean) as string[];
    if (!lines.length) continue;
    await events.notify(
      tx,
      businessTime,
      `${key}:digest:${supervisor.id}`,
      'oversight.digest',
      [supervisor],
      {
        title: `Oversight digest: ${plural(lines.length, 'item', 'items')} need attention`,
        body: `${lines.join('; ')}.`,
        link: '/supervisor',
      },
    );
  }

  const soon = shiftDays(localDate(now), BASELINE_LOOKAHEAD_DAYS, {
    mode: 'calendar',
    holidays: [],
  });
  const cutoffPassed = now > Date.parse(cycle.evaluationCutoff);
  for (const officer of await usersWithRole(tx, 'officer')) {
    const scope = await assignedInstitutionIds(tx, officer.id);
    const data = await scopeData(tx, scope);
    const latest = scope.flatMap((institutionId) =>
      cycle.periods.flatMap((period) => {
        const row = latestOf(
          data.baselines.filter((item) => item.institutionId === institutionId),
          period.id,
        );
        return row ? [{ row, period }] : [];
      }),
    );
    const toApprove = latest.filter(
      ({ row, period }) => row.status === 'proposed' && period.startsOn <= soon,
    );
    const toConfirm = latest.filter(
      ({ row }) =>
        row.historicalSeed !== null && row.historicalSeed.confirmedAt === null,
    );
    const overdue = data.obligations.filter((obligation) =>
      isReviewOverdue(obligation, businessTime, rule),
    );
    const nearing = data.obligations.filter((obligation) => {
      if (
        (obligation.state !== 'submitted' &&
          obligation.state !== 'under_review') ||
        !obligation.lastReceiptAt ||
        isReviewOverdue(obligation, businessTime, rule)
      )
        return false;
      const due = Date.parse(reviewDueAt(obligation.lastReceiptAt, rule));
      return due - now <= REVIEW_WARNING_DAYS * 86_400_000;
    });
    const windowsEnded = data.clarifications.filter((item) => item.overdue);
    const noFocal = unreachableOf(scope, data.focal);
    const undisposed = cutoffPassed
      ? data.obligations.filter(
          (obligation) =>
            obligation.state !== 'finalized' &&
            obligation.state !== 'closed_without_submission',
        )
      : [];
    const lines = [
      toApprove.length &&
        `${plural(toApprove.length, 'baseline needs', 'baselines need')} your approval before the quarter opens`,
      toConfirm.length &&
        `${plural(toConfirm.length, 'seeded baseline needs', 'seeded baselines need')} confirming against the approved plan`,
      overdue.length &&
        `${plural(overdue.length, 'review is', 'reviews are')} past the review target`,
      nearing.length &&
        `${plural(nearing.length, 'review reaches', 'reviews reach')} the review target within ${REVIEW_WARNING_DAYS} days`,
      windowsEnded.length &&
        `${plural(windowsEnded.length, 'clarification window has', 'clarification windows have')} ended without a response`,
      undisposed.length &&
        `${plural(undisposed.length, 'quarter needs', 'quarters need')} a final disposition after the cutoff`,
      noFocal.length &&
        `${plural(noFocal.length, 'institution has', 'institutions have')} no active focal person to report or answer clarifications (${some(noFocal)})`,
    ].filter(Boolean) as string[];
    if (!lines.length) continue;
    await events.notify(
      tx,
      businessTime,
      `${key}:officer-digest:${officer.id}`,
      'review.digest',
      [officer],
      {
        title: `Your review digest: ${plural(lines.length, 'item', 'items')}`,
        body: `${lines.join('; ')}.`,
        link: '/officer',
      },
    );
  }
}
