import type { Obligation, ObligationFlag } from '@cpi/contracts';
import { getDb, type MockObligation } from '../db';
import { clarificationsFor } from './clarifications';

/** Flags are derived from business time on the server, never in the browser (FR02). */
export function toObligation(obligation: MockObligation): Obligation {
  const { cycle, businessTime } = getDb();
  const period = cycle.periods.find(
    (candidate) => candidate.id === obligation.periodId,
  );
  if (!period) throw new Error(`Unknown period ${obligation.periodId}`);
  const now = Date.parse(businessTime);
  const periodEnd = Date.parse(`${period.endsOn}T23:59:59+03:00`);
  const deadline = Date.parse(period.submissionDeadline);
  const flags: ObligationFlag[] = [];
  if (now <= periodEnd) flags.push('not_yet_due');
  const submittedAt = obligation.firstSubmittedAt
    ? Date.parse(obligation.firstSubmittedAt)
    : undefined;
  if (submittedAt !== undefined ? submittedAt > deadline : now > deadline)
    flags.push('late');
  if (
    clarificationsFor(obligation.id).some(
      (clarification) => clarification.overdue,
    )
  )
    flags.push('clarification_overdue');
  return { ...obligation, flags };
}
