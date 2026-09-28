import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationMatrix } from '@/features/directory/obligation-matrix';
import {
  cycleQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { reviewQueueQuery, type QueueStatus } from '@/features/review/queries';
import { ReviewQueueTable } from '@/features/review/queue-table';
import { cn } from '@/lib/utils';

const route = getRouteApi('/authed/officer/');

const tabs: { value: QueueStatus; label: string }[] = [
  { value: 'open', label: 'Awaiting my review' },
  { value: 'finalized', label: 'Finalized' },
];

export function OfficerHomePage() {
  const tab = route.useSearch().tab ?? 'open';
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const obligations = useQuery(obligationsQuery());
  const open = useQuery(reviewQueueQuery('open'));
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Prevention officer"
        title="Assigned work"
        description={
          open.data === undefined
            ? 'Loading your queue…'
            : open.data.length === 0
              ? 'No submissions are waiting for your review.'
              : `${open.data.length} submission${open.data.length === 1 ? '' : 's'} waiting for your review, oldest first.`
        }
      />
      <section aria-labelledby="queue-heading" className="grid gap-3">
        <h2 id="queue-heading" className="text-lg font-semibold">
          Review queue
        </h2>
        <nav aria-label="Queue filter">
          <ul className="flex gap-1 border-b">
            {tabs.map((item) => (
              <li key={item.value}>
                <Link
                  to="/officer"
                  search={{ tab: item.value }}
                  aria-current={tab === item.value ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium',
                    tab === item.value
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ReviewQueueTable status={tab} audience="officer" />
      </section>
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
                      linkToInstitution="officer"
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
