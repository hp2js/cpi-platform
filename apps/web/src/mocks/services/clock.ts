import type { ClockBoundary } from '@cpi/contracts';
import { getDb, type MockDb } from '../db';
import { endOfDay, localDate, shiftDays } from './days';
import { endExpiredCover } from './assignments';
import { toClarification } from './clarifications';
import {
  assignedOfficers,
  institutionUsers,
  notify,
  usersWithRole,
} from './events';
import { isReviewOverdue, reviewDueAt } from './obligations';
import { assignedInstitutionIds, supervisedInstitutionIds } from './scope';

/**
 * Server-side demo clock (FR14). Advancing crosses named boundaries in order, and each boundary
 * event is processed once per run, so repeating an advance cannot duplicate notifications.
 */

const iso = (ms: number) =>
  `${new Date(ms + 3 * 3_600_000).toISOString().slice(0, 19)}+03:00`;

export function boundaries(): Omit<ClockBoundary, 'passed'>[] {
  const { cycle, reminders } = getDb();
  const list: Omit<ClockBoundary, 'passed'>[] = [];
  for (const period of cycle.periods) {
    const deadline = Date.parse(period.submissionDeadline);
    const opens = Date.parse(`${period.endsOn}T23:59:59+03:00`) + 1000;
    list.push({
      id: `${period.label}-open`,
      label: `${period.label} reporting opens`,
      at: iso(opens),
      kind: 'reporting_open',
    });
    // The reminder schedule is an administrator setting (FR02; PRD §9.1 defaults 7 and 1).
    // Counted in the cycle's day rule: working days skip weekends and public holidays.
    const unit = cycle.dayCounting.mode === 'working' ? 'working ' : '';
    for (const days of reminders.daysBefore) {
      list.push({
        id: `${period.label}-reminder-${days}`,
        label: `${period.label} reminder: ${days} ${unit}${days === 1 ? 'day' : 'days'} to deadline`,
        at: endOfDay(shiftDays(localDate(deadline), -days, cycle.dayCounting)),
        kind: 'reminder',
      });
    }
    list.push({
      id: `${period.label}-due`,
      label: `${period.label} deadline (last on-time second)`,
      at: period.submissionDeadline,
      kind: 'deadline',
    });
    list.push({
      id: `${period.label}-overdue`,
      label: `${period.label} overdue`,
      at: iso(deadline + 1000),
      kind: 'overdue',
    });
  }
  const cutoff = Date.parse(cycle.evaluationCutoff);
  list.push({
    id: 'evaluation-cutoff',
    label: 'Evaluation cutoff passes',
    at: iso(cutoff + 1000),
    kind: 'cutoff',
  });
  list.push({
    id: 'publication',
    label: 'Annual publication window',
    at: iso(cutoff + 1000 + 9 * 3_600_000),
    kind: 'publication',
  });
  return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function unsubmitted(db: MockDb, periodId: string) {
  return db.obligations.filter(
    (obligation) =>
      obligation.periodId === periodId &&
      (obligation.state === 'not_started' || obligation.state === 'draft'),
  );
}

function process(db: MockDb, boundary: Omit<ClockBoundary, 'passed'>) {
  const key = `${db.runId}:${boundary.id}`;
  if (db.processedEvents.includes(key)) return;
  db.processedEvents.push(key);
  const period = db.cycle.periods.find((candidate) =>
    boundary.id.startsWith(`${candidate.label}-`),
  );
  if (boundary.kind === 'reporting_open' && period) {
    for (const obligation of db.obligations.filter(
      (candidate) => candidate.periodId === period.id,
    )) {
      notify(
        db,
        `${key}:${obligation.institutionId}`,
        'reporting.open',
        institutionUsers(obligation.institutionId),
        {
          title: `${period.label} reporting is open`,
          body: `Your ${period.label} quarterly report is due by the deadline shown in the portal.`,
          link: `/institution/reports/${period.id}`,
        },
      );
    }
  }
  if (boundary.kind === 'reminder' && period) {
    for (const obligation of unsubmitted(db, period.id)) {
      notify(
        db,
        `${key}:${obligation.institutionId}`,
        'deadline.reminder',
        institutionUsers(obligation.institutionId),
        {
          title: boundary.label,
          body: `Your ${period.label} report has not been submitted yet.`,
          link: `/institution/reports/${period.id}`,
        },
      );
    }
  }
  if (boundary.kind === 'overdue' && period && db.reminders.overdueNotice) {
    for (const obligation of unsubmitted(db, period.id)) {
      notify(
        db,
        `${key}:${obligation.institutionId}`,
        'deadline.overdue',
        [
          ...institutionUsers(obligation.institutionId),
          ...assignedOfficers(obligation.institutionId),
        ],
        {
          title: `${period.label} report overdue: ${obligation.institutionId}`,
          body: `The ${period.label} deadline has passed without a submission. A late submission is still accepted and flagged as late.`,
          link: (recipient) =>
            recipient.role === 'institution'
              ? `/institution/reports/${period.id}`
              : `/officer/institutions/${obligation.institutionId}`,
        },
      );
    }
  }
  if (boundary.kind === 'cutoff') {
    for (const officer of db.users.filter(
      (user) => user.role === 'officer' && user.active,
    )) {
      notify(db, `${key}:${officer.id}`, 'evaluation.cutoff', [officer], {
        title: 'Evaluation cutoff has passed',
        body: 'Record final dispositions for any remaining quarters so results can be released.',
        link: '/officer',
      });
    }
  }
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * One digest per supervisor per boundary, only when something in their institutions needs
 * attention (PRD §4.1, G4). A live system would send it daily; the demo sends it as the clock
 * crosses each boundary, so a replayed boundary never repeats it.
 */
function sendOversightDigests(db: MockDb, key: string) {
  const now = Date.parse(db.businessTime);
  for (const supervisor of usersWithRole('supervisor')) {
    const scope = supervisedInstitutionIds(supervisor.id);
    const obligations = db.obligations.filter((obligation) =>
      scope.includes(obligation.institutionId),
    );
    const missing = obligations.filter((obligation) => {
      const period = db.cycle.periods.find(
        (candidate) => candidate.id === obligation.periodId,
      )!;
      return (
        (obligation.state === 'not_started' || obligation.state === 'draft') &&
        Date.parse(period.submissionDeadline) < now
      );
    });
    const reviews = obligations.filter(isReviewOverdue);
    const clarifications = db.clarifications
      .filter((clarification) => scope.includes(clarification.institutionId))
      .map(toClarification);
    const overdue = clarifications.filter((item) => item.overdue);
    const extensions = new Set(
      clarifications
        .filter((item) => item.extensionRequired)
        .map((item) => item.institutionId),
    );
    const lines = [
      missing.length &&
        `${plural(missing.length, 'report', 'reports')} missing after the deadline`,
      reviews.length &&
        `${plural(reviews.length, 'review', 'reviews')} past the officer review target (${db.cycle.dayCounting.reviewTargetDays} ${db.cycle.dayCounting.mode === 'working' ? 'working ' : ''}days)`,
      overdue.length &&
        `${plural(overdue.length, 'clarification', 'clarifications')} past the response window`,
      extensions.size &&
        `${plural(extensions.size, 'institution needs', 'institutions need')} an extension decision`,
    ].filter(Boolean) as string[];
    if (!lines.length) continue;
    notify(
      db,
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
}

/** Days ahead that an unapproved baseline starts to matter: its quarter opens soon (PRD §10.4). */
const BASELINE_LOOKAHEAD_DAYS = 14;
/** Days ahead that a review nearing the officer review target is mentioned. */
const REVIEW_WARNING_DAYS = 2;

/**
 * One digest per officer per boundary, only when their own portfolio needs attention: baselines
 * to approve before a quarter opens, seeded baselines to confirm, reviews near or past the
 * target, clarification windows that have ended, and dispositions due after the cutoff.
 */
function sendOfficerDigests(db: MockDb, key: string) {
  const now = Date.parse(db.businessTime);
  const today = localDate(now);
  const soon = shiftDays(today, BASELINE_LOOKAHEAD_DAYS, {
    mode: 'calendar',
    holidays: [],
  });
  const cutoffPassed = now > Date.parse(db.cycle.evaluationCutoff);
  for (const officer of usersWithRole('officer')) {
    const scope = assignedInstitutionIds(officer.id);
    // The latest version of each quarter's baseline.
    const latest = new Map<string, MockDb['baselines'][number]>();
    for (const baseline of db.baselines.filter((item) =>
      scope.includes(item.institutionId),
    )) {
      const at = `${baseline.institutionId}|${baseline.periodId}`;
      if ((latest.get(at)?.version ?? 0) < baseline.version)
        latest.set(at, baseline);
    }
    const toApprove = [...latest.values()].filter((baseline) => {
      const period = db.cycle.periods.find(
        (candidate) => candidate.id === baseline.periodId,
      )!;
      return baseline.status !== 'approved' && period.startsOn <= soon;
    });
    const toConfirm = [...latest.values()].filter(
      (baseline) =>
        baseline.historicalSeed !== null &&
        baseline.historicalSeed.confirmedAt === null,
    );
    const obligations = db.obligations.filter((obligation) =>
      scope.includes(obligation.institutionId),
    );
    const overdue = obligations.filter(isReviewOverdue);
    const nearing = obligations.filter((obligation) => {
      if (
        (obligation.state !== 'submitted' &&
          obligation.state !== 'under_review') ||
        !obligation.lastReceiptAt ||
        isReviewOverdue(obligation)
      )
        return false;
      const due = Date.parse(reviewDueAt(obligation.lastReceiptAt));
      return due - now <= REVIEW_WARNING_DAYS * 86_400_000;
    });
    const windowsEnded = db.clarifications
      .filter((clarification) => scope.includes(clarification.institutionId))
      .map(toClarification)
      .filter((clarification) => clarification.overdue);
    const undisposed = cutoffPassed
      ? obligations.filter(
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
    ].filter(Boolean) as string[];
    if (!lines.length) continue;
    notify(
      db,
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

/**
 * After a schedule change, reminders already in the past are marked processed so a new
 * reminder time never fires retroactively.
 */
export function skipPastBoundaries(db: MockDb) {
  const now = Date.parse(db.businessTime);
  for (const boundary of boundaries()) {
    const key = `${db.runId}:${boundary.id}`;
    if (
      boundary.kind === 'reminder' &&
      Date.parse(boundary.at) <= now &&
      !db.processedEvents.includes(key)
    )
      db.processedEvents.push(key);
  }
}

/** Moves business time forward to `target`, processing every boundary crossed exactly once. */
export function advanceTo(db: MockDb, target: string) {
  const from = Date.parse(db.businessTime);
  const to = Date.parse(target);
  if (to < from)
    throw new Error(
      'The demo clock only moves forward; reset the run to start again.',
    );
  for (const boundary of boundaries()) {
    const at = Date.parse(boundary.at);
    if (at > to) continue;
    // Each boundary's notifications and audit entries carry the time it occurred.
    if (at > Date.parse(db.businessTime)) db.businessTime = boundary.at;
    const key = `${db.runId}:${boundary.id}`;
    const fresh = !db.processedEvents.includes(key);
    process(db, boundary);
    if (fresh) {
      sendOversightDigests(db, key);
      sendOfficerDigests(db, key);
    }
  }
  db.businessTime = target;
  endExpiredCover(db);
}

export function boundaryState(): ClockBoundary[] {
  const now = Date.parse(getDb().businessTime);
  return boundaries().map((boundary) => ({
    ...boundary,
    passed: Date.parse(boundary.at) <= now,
  }));
}
