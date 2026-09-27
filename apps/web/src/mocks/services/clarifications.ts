import type { Clarification, DayCounting, ReportAnswers } from '@cpi/contracts';
import { endOfDay, localDate, shiftDays } from './days';
import { getDb, type MockDb, type MockSubmission } from '../db';

/**
 * The response window from the later of portal availability and in-app notification: the
 * configured number of counted days after that event's local date, ending 23:59:59
 * Africa/Nairobi (PRD §7.3: seven calendar days by default; working days if enforced).
 */
export function responseDueAt(
  availableAt: string,
  notifiedAt: string,
  counting: DayCounting = getDb().cycle.dayCounting,
) {
  const start = Math.max(Date.parse(availableAt), Date.parse(notifiedAt));
  return endOfDay(
    shiftDays(localDate(start), counting.clarificationDays, counting),
  );
}

export function effectiveCutoff(institutionId: string, db: MockDb = getDb()) {
  const extension = db.extensions.find(
    (candidate) => candidate.institutionId === institutionId,
  );
  const cutoff = Date.parse(db.cycle.evaluationCutoff);
  return extension ? Math.max(cutoff, Date.parse(extension.until)) : cutoff;
}

export function toClarification(
  stored: MockDb['clarifications'][number],
): Clarification {
  const { businessTime, cycle } = getDb();
  return {
    ...stored,
    overdue:
      stored.status === 'open' &&
      Date.parse(businessTime) > Date.parse(stored.responseDueAt),
    // Never shortened automatically: an authorized extension or a pending result is required.
    extensionRequired:
      stored.status === 'open' &&
      Date.parse(stored.responseDueAt) > Date.parse(cycle.evaluationCutoff) &&
      Date.parse(stored.responseDueAt) > effectiveCutoff(stored.institutionId),
  };
}

export function clarificationsFor(obligationId: string) {
  return getDb()
    .clarifications.filter(
      (clarification) => clarification.obligationId === obligationId,
    )
    .map(toClarification);
}

/** Canonical form of what a milestone decision depends on: the answer and the exact files cited. */
function dependencyOf(submission: MockSubmission, milestoneId: string) {
  const db = getDb();
  const response = submission.answers.milestones[milestoneId];
  if (!response) return 'missing';
  const files = response.evidence
    .map((reference) => {
      const item = db.evidence.find(
        (candidate) => candidate.id === reference.evidenceId,
      );
      return `${reference.evidenceId}:${item?.sha256 ?? 'absent'}:${reference.passage}`;
    })
    .sort();
  return JSON.stringify({ ...response, evidence: files });
}

/**
 * Decision dependency rule (PRD §7.3, AT27): a changed answer, or a replaced or withdrawn file,
 * marks the milestone changed. A file shared by several milestones affects all of them.
 */
export function dependencyChanges(
  previous: MockSubmission,
  current: MockSubmission,
  milestoneIds: string[],
) {
  const changes: Record<string, 'changed' | 'unchanged'> = {};
  for (const id of milestoneIds)
    changes[id] =
      dependencyOf(previous, id) === dependencyOf(current, id)
        ? 'unchanged'
        : 'changed';
  return changes;
}

export function copyAnswers(answers: ReportAnswers): ReportAnswers {
  return structuredClone(answers);
}
