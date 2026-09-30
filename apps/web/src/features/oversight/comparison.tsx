import type { Oversight } from '@cpi/contracts';
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

function ComparisonTable({
  rows,
  maxPoints,
}: {
  rows: Oversight['comparison'];
  maxPoints: number;
}) {
  const controls = useListControls(
    rows,
    (row) => `${row.institutionId} ${row.institutionName} ${row.periodLabel}`,
    40,
  );
  return (
    <div className="grid gap-3">
      {rows.length > controls.pageSize && (
        <ListSearch
          controls={controls}
          label="Find an institution"
          placeholder="ID, name or quarter"
        />
      )}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table className="min-w-[40rem]">
          <TableCaption className="sr-only">
            Finalized reviewed implementation by institution and quarter
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Institution</TableHead>
              <TableHead scope="col">Quarter</TableHead>
              <TableHead scope="col">Accepted</TableHead>
              <TableHead scope="col">Points (of {maxPoints})</TableHead>
              <TableHead scope="col">Plan size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.visible.map((row) => (
              <TableRow key={`${row.institutionId}-${row.periodLabel}`}>
                <TableHead scope="row">
                  {row.institutionId}{' '}
                  <span className="font-normal text-base-dark">
                    {row.institutionName}
                  </span>
                </TableHead>
                <TableCell>{row.periodLabel}</TableCell>
                <TableCell className="tabular-nums">
                  {row.reviewed.numerator} of {row.reviewed.denominator}
                </TableCell>
                <TableCell className="tabular-nums">{row.points}</TableCell>
                <TableCell className="tabular-nums">
                  {row.planSize} milestones
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPager controls={controls} noun="rows" />
    </div>
  );
}

/** Finalized quarters only, listed by institution and never ranked (PRD §10.7). */
export function FinalizedComparison({
  data,
}: {
  data: Pick<Oversight, 'comparison' | 'averageReviewed'>;
}) {
  return (
    <section aria-labelledby="comparison-heading" className="grid gap-3">
      <div>
        <h2 id="comparison-heading" className="text-lg font-bold">
          Finalized quarterly implementation
        </h2>
        <p className="mt-1 max-w-measure text-sm text-base-dark">
          Same cycle and profile, finalized quarters only (
          {data.comparison.length} of {data.averageReviewed.expected}{' '}
          institution-quarters). Listed by institution, not ranked: plans differ
          in size and ambition, so equal values do not mean equal prevention
          impact.
        </p>
      </div>
      {data.comparison.length === 0 ? (
        <p className="bg-base-lightest p-4 text-sm text-base-dark">
          No quarter has been finalized yet. Results appear here as reviews are
          finalized.
        </p>
      ) : (
        <ComparisonTable
          rows={data.comparison}
          maxPoints={data.averageReviewed.maxPoints}
        />
      )}
    </section>
  );
}
