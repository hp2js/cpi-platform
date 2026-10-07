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
import { planningWorkQuery } from '@/features/planning/queries';
import { PlanningWorkList } from '@/features/planning/work-list';
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
  const work = useQuery(planningWorkQuery);
  const planItems = work.data?.totals.items ?? 0;
  const flagged = work.data?.totals.flagged ?? 0;
  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Prevention officer"
        title="Assigned work"
        description={
          open.data === undefined || work.data === undefined
            ? 'Loading your work…'
            : [
                open.data.length === 0
                  ? 'No submissions are waiting for your review.'
                  : `${open.data.length} submission${open.data.length === 1 ? '' : 's'} waiting for your review, oldest first.`,
                planItems === 0
                  ? 'No plans or documents are waiting for you.'
                  : `${planItems} plan and document item${planItems === 1 ? '' : 's'} to review${flagged ? `, ${flagged} urgent` : ''}.`,
              ].join(' ')
        }
      />
      <section aria-labelledby="queue-heading" className="grid gap-3">
        <h2 id="queue-heading" className="text-lg font-bold">
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
                    '-mb-px inline-block border-b-2 px-3 py-2 text-sm font-bold',
                    tab === item.value
                      ? 'border-primary text-ink'
                      : 'border-transparent text-base-dark hover:text-ink',
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
      <section aria-labelledby="plan-work-heading" className="grid gap-3">
        <h2 id="plan-work-heading" className="text-lg font-bold">
          Plans and documents to review
        </h2>
        <p className="text-sm text-base-dark">
          Baseline proposals, seeded baselines and amendments to confirm, and
          foundation documents, most urgent first.
        </p>
        <QueryView
          query={work}
          label="plan work"
          isEmpty={(data) => data.items.length === 0}
          empty="No plans or documents are waiting for you."
        >
          {(data) => (
            <PlanningWorkList
              items={data.items}
              audience="officer"
              caption="Plans and documents waiting for your review, most urgent first"
            />
          )}
        </QueryView>
      </section>
      <section aria-labelledby="portfolio-status" className="grid gap-3">
        <h2 id="portfolio-status" className="text-lg font-bold">
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
