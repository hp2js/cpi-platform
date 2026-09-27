import { useQuery } from '@tanstack/react-query';
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
import { oversightQuery } from '@/features/oversight/queries';

export function WorkloadPage() {
  const oversight = useQuery(oversightQuery({}));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Oversight"
        title="Review workload and comparison"
        description="Supervisor comments support oversight; they are not an extra approval step for officers’ decisions."
      />
      <QueryView query={oversight} label="workload">
        {(data) => (
          <div className="grid gap-8">
            <section aria-labelledby="workload-heading" className="grid gap-3">
              <h2 id="workload-heading" className="text-lg font-semibold">
                Officer workload
              </h2>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <Table className="min-w-[44rem]">
                  <TableCaption className="sr-only">
                    Open and completed review work per officer
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Officer</TableHead>
                      <TableHead scope="col">Institutions</TableHead>
                      <TableHead scope="col">Awaiting officer</TableHead>
                      <TableHead scope="col">Awaiting institution</TableHead>
                      <TableHead scope="col">Oldest waiting review</TableHead>
                      <TableHead scope="col">Finalized</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.workload.map((row) => (
                      <TableRow key={row.officerId}>
                        <TableHead scope="row">{row.officerName}</TableHead>
                        <TableCell className="tabular-nums">
                          {row.institutions}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.awaitingOfficer}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.awaitingInstitution}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.oldestReviewDays === null
                            ? 'None waiting'
                            : `${row.oldestReviewDays} days`}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.finalized}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
            <section
              aria-labelledby="comparison-heading"
              className="grid gap-3"
            >
              <div>
                <h2 id="comparison-heading" className="text-lg font-semibold">
                  Finalized quarterly implementation
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  Same cycle and profile, finalized quarters only (
                  {data.comparison.length} of {data.averageReviewed.expected}{' '}
                  institution-quarters). Listed by institution, not ranked:
                  plans differ in size and ambition, so equal values do not mean
                  equal prevention impact.
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <Table className="min-w-[40rem]">
                  <TableCaption className="sr-only">
                    Finalized reviewed implementation by institution and quarter
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Institution</TableHead>
                      <TableHead scope="col">Quarter</TableHead>
                      <TableHead scope="col">Accepted</TableHead>
                      <TableHead scope="col">
                        Points (of {data.averageReviewed.maxPoints})
                      </TableHead>
                      <TableHead scope="col">Plan size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.comparison.map((row) => (
                      <TableRow key={`${row.institutionId}-${row.periodLabel}`}>
                        <TableHead scope="row">
                          {row.institutionId}{' '}
                          <span className="font-normal text-muted-foreground">
                            {row.institutionName}
                          </span>
                        </TableHead>
                        <TableCell>{row.periodLabel}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.reviewed.numerator} of {row.reviewed.denominator}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.points}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.planSize} milestones
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </QueryView>
    </div>
  );
}
