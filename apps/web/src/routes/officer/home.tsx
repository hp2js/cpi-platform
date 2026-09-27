import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { FlagList, WorkflowStateBadge } from '@/components/status';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ObligationMatrix } from '@/features/directory/obligation-matrix';
import {
  cycleQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { ageLabel, daysBetween } from '@/features/review/age';
import { reviewQueueQuery, type QueueStatus } from '@/features/review/queries';
import { useSession } from '@/features/session/use-session';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const route = getRouteApi('/authed/officer/');

const tabs: { value: QueueStatus; label: string }[] = [
  { value: 'open', label: 'Awaiting my review' },
  { value: 'finalized', label: 'Finalized' },
];

function Queue({ status }: { status: QueueStatus }) {
  const session = useSession();
  const queue = useQuery(reviewQueueQuery(status));
  const now = session.clock.businessTime;
  return (
    <QueryView
      query={queue}
      label="review queue"
      isEmpty={(list) => list.length === 0}
      empty={
        status === 'open'
          ? 'No submissions are waiting for your review.'
          : 'Nothing has been finalized yet.'
      }
    >
      {(list) => (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[48rem]">
            <TableCaption className="sr-only">
              {status === 'open'
                ? 'Submissions awaiting review, oldest first'
                : 'Finalized submissions'}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Institution</TableHead>
                <TableHead scope="col">Period</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Revision received</TableHead>
                <TableHead scope="col">Waiting</TableHead>
                <TableHead scope="col">Case age</TableHead>
                <TableHead scope="col">Decisions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((item) => (
                <TableRow key={item.submissionId}>
                  <TableHead
                    scope="row"
                    className="h-auto py-3 font-normal whitespace-normal"
                  >
                    <Link
                      to="/officer/reviews/$submissionId"
                      params={{ submissionId: item.submissionId }}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {item.institutionId}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {item.institutionName}
                    </span>
                  </TableHead>
                  <TableCell>
                    {item.periodLabel} · r{item.revision}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col items-start gap-1">
                      <WorkflowStateBadge state={item.state} />
                      <FlagList flags={item.flags} />
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateTime(item.receivedAt)}
                  </TableCell>
                  <TableCell>
                    {ageLabel(daysBetween(item.receivedAt, now))}
                  </TableCell>
                  <TableCell>
                    {ageLabel(daysBetween(item.firstSubmittedAt, now))}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {item.decisionsRecorded} of {item.decisionsRequired}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </QueryView>
  );
}

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
        <Queue status={tab} />
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
                      linkToInstitution
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
