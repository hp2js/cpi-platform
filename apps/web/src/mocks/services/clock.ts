import type { ClockBoundary } from '@cpi/contracts';
import { getDb, type MockDb } from '../db';
import { endOfDay, localDate, shiftDays } from './days';
import { assignedOfficers, institutionUsers, notify } from './events';

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
    process(db, boundary);
  }
  db.businessTime = target;
}

export function boundaryState(): ClockBoundary[] {
  const now = Date.parse(getDb().businessTime);
  return boundaries().map((boundary) => ({
    ...boundary,
    passed: Date.parse(boundary.at) <= now,
  }));
}
