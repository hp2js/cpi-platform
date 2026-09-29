import { previewPlanImport as preview } from '@cpi/contracts';
import type { MockDb } from '../db';
import { latestBaseline, periodLocked } from './plans';

export { issueMessages, type PlanImportRow } from '@cpi/contracts';

/** The shared plan import (FR04), checked against this institution's plan in the mock. */
export function previewPlanImport(
  db: MockDb,
  institutionId: string,
  csv: string,
) {
  const own = <T extends { institutionId: string }>(items: T[]) =>
    items.filter((item) => item.institutionId === institutionId);
  return preview(
    {
      risks: own(db.risks),
      activities: own(db.activities),
      plannedMilestones: own(db.plannedMilestones),
      periods: db.cycle.periods,
      closedPeriodIds: new Set(
        db.cycle.periods
          .filter(
            (period) =>
              periodLocked(db, institutionId, period) ||
              latestBaseline(db, institutionId, period.id)?.status ===
                'approved',
          )
          .map((period) => period.id),
      ),
    },
    csv,
  );
}
