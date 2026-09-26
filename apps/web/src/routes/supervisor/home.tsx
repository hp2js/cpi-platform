import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationMatrix } from '@/features/directory/obligation-matrix';
import {
  assignmentsQuery,
  cycleQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';

export function SupervisorHomePage() {
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const obligations = useQuery(obligationsQuery());
  const assignments = useQuery(assignmentsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={cycle.data?.label}
        title="Oversight overview"
        description="Reporting and review status for every institution and quarter. Pending work is shown as pending, never as zero."
      />
      <section aria-labelledby="coverage-heading" className="grid gap-3">
        <h2 id="coverage-heading" className="text-lg font-semibold">
          Institution-quarter status
        </h2>
        <QueryView query={cycle} label="reporting calendar">
          {(cycleData) => (
            <QueryView query={institutions} label="institutions">
              {(list) => (
                <QueryView query={obligations} label="reporting obligations">
                  {(obligationList) => (
                    <QueryView query={assignments} label="officer assignments">
                      {(assignmentList) => (
                        <ObligationMatrix
                          caption="All institutions by quarter, with assigned officer"
                          cycle={cycleData}
                          institutions={list}
                          obligations={obligationList}
                          assignments={assignmentList}
                        />
                      )}
                    </QueryView>
                  )}
                </QueryView>
              )}
            </QueryView>
          )}
        </QueryView>
      </section>
    </div>
  );
}
