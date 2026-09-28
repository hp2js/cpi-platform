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
import {
  assignmentsQuery,
  cycleQuery,
  institutionsQuery,
} from '@/features/directory/queries';
import { healthQuery } from '@/lib/api';
import { formatDateRange, formatDateTime } from '@/lib/dates';

function SystemStatus() {
  const health = useQuery({ ...healthQuery, retry: false });
  const label = (status: 'up' | 'down') =>
    status === 'up' ? 'Connected' : 'Unavailable';
  return (
    <section
      aria-labelledby="system-heading"
      className="rounded-xl border bg-card p-5"
    >
      <h2 id="system-heading" className="font-semibold">
        Backend services
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Live readiness of the API's database and cache. Screens currently use
        the mock API.
      </p>
      {health.data ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">PostgreSQL</dt>
          <dd>{label(health.data.services.database)}</dd>
          <dt className="text-muted-foreground">Redis</dt>
          <dd>{label(health.data.services.redis)}</dd>
        </dl>
      ) : (
        <p className="mt-3 text-sm">
          {health.isPending ? 'Checking…' : 'The API is not reachable.'}
        </p>
      )}
    </section>
  );
}

export function AdminHomePage() {
  const cycle = useQuery(cycleQuery);
  const assignments = useQuery(assignmentsQuery);
  const institutions = useQuery(institutionsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Console"
        description="Cycle configuration, officer portfolios and system status."
      />

      <section aria-labelledby="calendar-heading" className="grid gap-3">
        <h2 id="calendar-heading" className="text-lg font-semibold">
          Reporting calendar
        </h2>
        <QueryView query={cycle} label="reporting calendar">
          {(data) => (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableCaption className="sr-only">
                  {data.label} reporting periods and deadlines ({data.timezone})
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Period</TableHead>
                    <TableHead scope="col">Reporting dates</TableHead>
                    <TableHead scope="col">Submission deadline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.periods.map((period) => (
                    <TableRow key={period.id}>
                      <TableHead scope="row">{period.label}</TableHead>
                      <TableCell>
                        {formatDateRange(period.startsOn, period.endsOn)}
                      </TableCell>
                      <TableCell>
                        {formatDateTime(period.submissionDeadline)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableHead scope="row">Foundations</TableHead>
                    <TableCell>
                      Procedures, risk assessment, mitigation plan
                    </TableCell>
                    <TableCell>
                      {formatDateTime(data.foundationDeadline)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead scope="row">Evaluation cutoff</TableHead>
                    <TableCell>
                      Simulated demonstration setting, not an official EACC
                      deadline
                    </TableCell>
                    <TableCell>
                      {formatDateTime(data.evaluationCutoff)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </QueryView>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[2fr_1fr]">
        <section aria-labelledby="assignments-heading" className="grid gap-3">
          <h2 id="assignments-heading" className="text-lg font-semibold">
            Officer portfolios
          </h2>
          <QueryView query={assignments} label="officer assignments">
            {(list) => (
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  ...new Set(list.map((assignment) => assignment.officerName)),
                ].map((officer) => (
                  <div key={officer} className="rounded-lg border bg-card p-4">
                    <h3 className="font-medium">{officer}</h3>
                    <ul className="mt-2 grid gap-1 text-sm">
                      {list
                        .filter(
                          (assignment) =>
                            assignment.officerName === officer &&
                            !assignment.validTo,
                        )
                        .map((assignment) => (
                          <li key={assignment.institutionId}>
                            <span className="font-medium">
                              {assignment.institutionId}
                            </span>{' '}
                            <span className="text-muted-foreground">
                              {
                                institutions.data?.find(
                                  (institution) =>
                                    institution.id === assignment.institutionId,
                                )?.name
                              }
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </QueryView>
        </section>
        <SystemStatus />
      </div>
    </div>
  );
}
