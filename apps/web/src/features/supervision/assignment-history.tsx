import { useMemo } from 'react';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/dates';

export interface HistoryRow {
  institutionId: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  reason: string | null;
}

/** Officer or supervisor history, oldest first per institution. */
export function AssignmentHistory({
  list,
  who,
  headingId,
  title,
}: {
  list: HistoryRow[];
  who: 'Officer' | 'Supervisor';
  headingId: string;
  title: string;
}) {
  const sorted = useMemo(
    () =>
      [...list].sort(
        (a, b) =>
          a.institutionId.localeCompare(b.institutionId) ||
          a.validFrom.localeCompare(b.validFrom),
      ),
    [list],
  );
  const controls = useListControls(
    sorted,
    (row) => `${row.institutionId} ${row.name} ${row.reason ?? ''}`,
    50,
  );
  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="font-semibold">
        {title}
      </h2>
      <ListSearch
        controls={controls}
        label={`Filter the ${who.toLowerCase()} history`}
        placeholder={`Institution ID, ${who.toLowerCase()} or reason`}
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[44rem]">
          <TableCaption className="sr-only">{title}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">{who}</TableHead>
              <TableHead scope="col">From</TableHead>
              <TableHead scope="col">To</TableHead>
              <TableHead scope="col">Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map((row) => (
              <TableRow key={`${row.institutionId}-${row.validFrom}`}>
                <TableHead scope="row">{row.institutionId}</TableHead>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-sm">
                  {formatDateTime(row.validFrom)}
                </TableCell>
                <TableCell className="text-sm">
                  {row.validTo ? formatDateTime(row.validTo) : 'Current'}
                </TableCell>
                <TableCell className="text-sm whitespace-normal">
                  {row.reason ?? 'Initial assignment'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="records" />
    </section>
  );
}
