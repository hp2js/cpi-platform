import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CircleCheck } from 'lucide-react';
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
import { assignmentsQuery, cycleQuery } from '@/features/directory/queries';
import { adminAttentionQuery } from '@/features/settings/queries';
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

/** What needs the administrator now, each linking to where it is handled (PRD §9). */
function Attention() {
  const attention = useQuery(adminAttentionQuery);
  return (
    <section
      aria-labelledby="attention-heading"
      className="grid gap-3 rounded-xl border bg-card p-5"
    >
      <h2 id="attention-heading" className="font-semibold">
        What needs you
      </h2>
      <QueryView query={attention} label="items needing attention">
        {(items) =>
          items.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 text-primary" aria-hidden="true" />
              Nothing needs you right now.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.link}
                    className="group flex h-full items-start gap-3 rounded-lg border p-3 hover:border-primary hover:bg-accent"
                  >
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-destructive px-2 py-0.5 text-sm font-semibold text-white tabular-nums">
                      {item.count}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    <ArrowRight
                      className="ml-auto size-4 shrink-0 self-center text-muted-foreground group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </section>
  );
}

export function AdminHomePage() {
  const cycle = useQuery(cycleQuery);
  const assignments = useQuery(assignmentsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Console"
        description="What needs you, the reporting calendar, officer portfolios and system status."
      />
      <Attention />

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
              // Counts, not lists: a portfolio can hold hundreds of institutions.
              <ul className="grid gap-2 md:grid-cols-2">
                {[
                  ...new Set(
                    list
                      .filter((assignment) => !assignment.validTo)
                      .map((assignment) => assignment.officerName),
                  ),
                ].map((officer) => {
                  const current = list.filter(
                    (assignment) =>
                      assignment.officerName === officer && !assignment.validTo,
                  );
                  return (
                    <li
                      key={officer}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4"
                    >
                      <span className="font-medium">{officer}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {current.length}{' '}
                        {current.length === 1 ? 'institution' : 'institutions'}
                        {current.some((assignment) => assignment.cover) &&
                          ' · covering'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryView>
        </section>
        <SystemStatus />
      </div>
    </div>
  );
}
