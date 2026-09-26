import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationMatrix } from '@/features/directory/obligation-matrix';
import {
  cycleQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';

export function OfficerHomePage() {
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const obligations = useQuery(obligationsQuery());
  const awaiting = obligations.data?.filter(
    (obligation) =>
      obligation.state === 'submitted' || obligation.state === 'under_review',
  ).length;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Prevention officer"
        title="Assigned work"
        description={
          awaiting === undefined
            ? 'Loading your queue…'
            : awaiting === 0
              ? 'No submissions are waiting for your review.'
              : `${awaiting} submission${awaiting === 1 ? '' : 's'} waiting for your review.`
        }
      />
      <section aria-labelledby="portfolio-status" className="grid gap-3">
        <h2 id="portfolio-status" className="text-lg font-semibold">
          Portfolio status
        </h2>
        <QueryView query={cycle} label="reporting calendar">
          {(cycleData) => (
            <QueryView
              query={institutions}
              label="assigned institutions"
              isEmpty={(list) => list.length === 0}
              empty="You have no assigned institutions."
            >
              {(list) => (
                <QueryView query={obligations} label="reporting obligations">
                  {(obligationList) => (
                    <ObligationMatrix
                      caption="Assigned institutions by quarter"
                      cycle={cycleData}
                      institutions={list}
                      obligations={obligationList}
                    />
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
