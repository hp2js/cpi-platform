import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { QueryView } from '@/components/query-view';
import { ObligationStatus } from '@/components/status';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSession } from '@/features/session/use-session';
import { formatDateTime } from '@/lib/dates';
import { ageLabel, daysBetween } from './age';
import { reviewQueueQuery, type QueueStatus } from './queries';

/** Review queue, oldest first. Officers see their assigned work; the supervisor reads all. */
export function ReviewQueueTable({
  status,
  audience,
}: {
  status: QueueStatus;
  audience: 'officer' | 'supervisor' | 'administrator';
}) {
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
          ? audience === 'officer'
            ? 'No submissions are waiting for your review.'
            : 'No submissions are waiting for review.'
          : 'Nothing has been finalized yet.'
      }
    >
      {(list) => (
        <div className="overflow-x-auto rounded-lg border-2 border-base-lighter bg-white">
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
                // The institution link stretches over the row, so the whole row opens the
                // review while keyboard and screen reader users still meet one link.
                <TableRow
                  key={item.submissionId}
                  className="relative hover:bg-base-lightest"
                >
                  <TableHead
                    scope="row"
                    className="h-auto py-3 font-normal whitespace-normal"
                  >
                    <Link
                      to={
                        audience === 'officer'
                          ? '/officer/reviews/$submissionId'
                          : audience === 'supervisor'
                            ? '/supervisor/reviews/$submissionId'
                            : '/admin/reviews/$submissionId'
                      }
                      params={{ submissionId: item.submissionId }}
                      className="font-bold usa-link after:absolute after:inset-0"
                    >
                      {item.institutionId}
                      <span className="sr-only">
                        , review {item.periodLabel} revision {item.revision}
                      </span>
                    </Link>
                    <span className="block text-xs text-base-dark">
                      {item.institutionName}
                    </span>
                  </TableHead>
                  <TableCell>
                    {item.periodLabel} · r{item.revision}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col items-start gap-1">
                      <ObligationStatus state={item.state} flags={item.flags} />
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
