import { and, eq, inArray } from 'drizzle-orm';
import type { ClockBoundary, Cycle } from '@cpi/contracts';
import { boundaries, type Reminders } from '../cycle/rules';
import type { Db, Tx } from '../database/db';
import {
  obligations,
  processedEvents,
  systemState,
  users,
} from '../database/schema';
import { currentState, loadCycle } from '../database/state';
import {
  assignedOfficers,
  institutionUsers,
  type Events,
} from '../events/events';
import { ApiError } from '../http/api-error';
import { endExpiredCover } from '../supervision/assignments';

/*
 * Server-side demo clock (FR14). Advancing crosses named boundaries in order, and each boundary
 * event is processed once per run, so repeating an advance cannot duplicate notifications.
 */

async function schedule(db: Db) {
  const [{ state, cycle: row }, cycle] = await Promise.all([
    currentState(db),
    loadCycle(db),
  ]);
  const reminders: Reminders = {
    daysBefore: row.reminderDaysBefore,
    overdueNotice: row.overdueNotice,
  };
  return { state, cycle, reminders, list: boundaries(cycle, reminders) };
}

export async function boundaryState(db: Db): Promise<ClockBoundary[]> {
  const { state, list } = await schedule(db);
  const now = Date.parse(state.businessTime);
  return list.map((boundary) => ({
    ...boundary,
    passed: Date.parse(boundary.at) <= now,
  }));
}

async function process(
  tx: Tx,
  events: Events,
  runId: string,
  at: string,
  cycle: Cycle,
  reminders: Reminders,
  boundary: Omit<ClockBoundary, 'passed'>,
) {
  const key = `${runId}:${boundary.id}`;
  const [fresh] = await tx
    .insert(processedEvents)
    .values({ runId, eventId: key })
    .onConflictDoNothing()
    .returning();
  if (!fresh) return;
  const period = cycle.periods.find((candidate) =>
    boundary.id.startsWith(`${candidate.label}-`),
  );
  const inPeriod = (states?: ('not_started' | 'draft')[]) =>
    tx
      .select()
      .from(obligations)
      .where(
        and(
          eq(obligations.periodId, period!.id),
          states ? inArray(obligations.state, states) : undefined,
        ),
      )
      .orderBy(obligations.id);
  const unsubmitted = () => inPeriod(['not_started', 'draft']);

  if (boundary.kind === 'reporting_open' && period)
    for (const obligation of await inPeriod())
      await events.notify(
        tx,
        at,
        `${key}:${obligation.institutionId}`,
        'reporting.open',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: `${period.label} reporting is open`,
          body: `Your ${period.label} quarterly report is due by the deadline shown in the portal.`,
          link: `/institution/reports/${period.id}`,
        },
      );
  if (boundary.kind === 'reminder' && period)
    for (const obligation of await unsubmitted())
      await events.notify(
        tx,
        at,
        `${key}:${obligation.institutionId}`,
        'deadline.reminder',
        await institutionUsers(tx, obligation.institutionId),
        {
          title: boundary.label,
          body: `Your ${period.label} report has not been submitted yet.`,
          link: `/institution/reports/${period.id}`,
        },
      );
  if (boundary.kind === 'overdue' && period && reminders.overdueNotice)
    for (const obligation of await unsubmitted())
      await events.notify(
        tx,
        at,
        `${key}:${obligation.institutionId}`,
        'deadline.overdue',
        [
          ...(await institutionUsers(tx, obligation.institutionId)),
          ...(await assignedOfficers(tx, obligation.institutionId)),
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
  if (boundary.kind === 'cutoff') {
    const officers = await tx
      .select()
      .from(users)
      .where(and(eq(users.role, 'officer'), eq(users.active, true)))
      .orderBy(users.id);
    for (const officer of officers)
      await events.notify(
        tx,
        at,
        `${key}:${officer.id}`,
        'evaluation.cutoff',
        [officer],
        {
          title: 'Evaluation cutoff has passed',
          body: 'Record final dispositions for any remaining quarters so results can be released.',
          link: '/officer',
        },
      );
  }
}

/**
 * Moves business time forward to `target`, processing every boundary crossed exactly once.
 * Each boundary's notifications carry the time it occurred. Call inside `write()`.
 */
export async function advanceTo(tx: Tx, events: Events, target: string) {
  const { state, cycle, reminders, list } = await schedule(tx);
  const to = Date.parse(target);
  if (to < Date.parse(state.businessTime))
    throw new ApiError(
      409,
      'The demo clock only moves forward; reset the run to start again.',
      'clock_backwards',
    );
  let now = state.businessTime;
  for (const boundary of list) {
    const at = Date.parse(boundary.at);
    if (at > to) continue;
    if (at > Date.parse(now)) now = boundary.at;
    await process(tx, events, state.runId, now, cycle, reminders, boundary);
  }
  await tx.update(systemState).set({ businessTime: target });
  // Temporary cover that ended in the crossed interval returns to the officer who was away.
  await endExpiredCover(tx, events, target);
}
