import type { Clarification, ReportAnswers } from '@cpi/contracts';
import { getDb, type MockDb, type MockSubmission } from '../db';

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Seven calendar days from the later of portal availability and in-app notification, ending
 * 23:59:59 Africa/Nairobi on the seventh day after that event's local date (PRD §7.3).
 */
export function responseDueAt(availableAt: string, notifiedAt: string) {
  const start = Math.max(Date.parse(availableAt), Date.parse(notifiedAt));
  const local = new Date(start + EAT_OFFSET_MS);
  const due = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + 7,
      23,
      59,
      59,
    ),
  );
  return `${due.toISOString().slice(0, 19)}+03:00`;
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
      Date.parse(stored.responseDueAt) > Date.parse(cycle.evaluationCutoff),
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
