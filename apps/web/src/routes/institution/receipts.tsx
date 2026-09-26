import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { receiptsQuery } from '@/features/reporting/queries';
import { formatDateTime } from '@/lib/dates';

export function ReceiptsPage() {
  const receipts = useQuery(receiptsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Receipts and history"
        description="Every submitted revision, newest first. Submitted revisions are kept exactly as received."
      />
      <QueryView
        query={receipts}
        label="receipts"
        isEmpty={(list) => list.length === 0}
        empty="Nothing has been submitted yet."
      >
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableCaption className="sr-only">
                Submitted revisions and their receipts
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Period</TableHead>
                  <TableHead scope="col">Revision</TableHead>
                  <TableHead scope="col">Received</TableHead>
                  <TableHead scope="col">Timeliness</TableHead>
                  <TableHead scope="col">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{receipt.periodLabel}</TableCell>
                    <TableCell>{receipt.revision}</TableCell>
                    <TableCell>{formatDateTime(receipt.receivedAt)}</TableCell>
                    <TableCell>
                      {receipt.timeliness === 'on_time' ? 'On time' : 'Late'}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/institution/receipts/$receiptId"
                        params={{ receiptId: receipt.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        View {receipt.id}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
