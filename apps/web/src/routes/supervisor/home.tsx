import type { Metric, Oversight } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Label } from '@/components/ui/label';
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
  assignmentsQuery,
  cycleQuery,
  institutionsQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { MetricChart } from '@/features/oversight/metric-chart';
import {
  oversightQuery,
  type OversightSearch,
} from '@/features/oversight/queries';
import { formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/supervisor/');

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">{metric.label}</p>
      <p className="text-2xl font-semibold tabular-nums">
        {metric.percent === null ? 'Not applicable' : `${metric.percent}%`}
      </p>
      <p className="text-sm tabular-nums">
        {metric.numerator} of {metric.denominator}
      </p>
      <p className="text-xs text-muted-foreground">{metric.definition}</p>
    </div>
  );
}

/** Filters live in the URL so a shared link reproduces the same view. */
function Filters({ search }: { search: OversightSearch }) {
  const navigate = useNavigate();
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const set = (patch: Partial<OversightSearch>) =>
    void navigate({
      to: '/supervisor',
      search: { ...search, ...patch },
      replace: true,
    });
  const select = 'h-9 rounded-md border bg-background px-2 text-sm';
  return (
    <form
      role="search"
      aria-label="Filter oversight"
      className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="filter-period">Quarter</Label>
        <select
          id="filter-period"
          className={select}
          value={search.periodId ?? ''}
          onChange={(event) =>
            set({ periodId: event.target.value || undefined })
          }
        >
          <option value="">All quarters</option>
          {cycle.data?.periods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-institution">Institution</Label>
        <select
          id="filter-institution"
          className={select}
          value={search.institutionId ?? ''}
          onChange={(event) =>
            set({ institutionId: event.target.value || undefined })
          }
        >
          <option value="">All institutions</option>
          {institutions.data?.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.id}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filter-officer">Officer</Label>
        <select
          id="filter-officer"
          className={select}
          value={search.officerId ?? ''}
          onChange={(event) =>
            set({ officerId: event.target.value || undefined })
          }
        >
          <option value="">All officers</option>
          <option value="officer-a">Prevention Officer A</option>
          <option value="officer-b">Prevention Officer B</option>
        </select>
      </div>
    </form>
  );
}

function Metrics({ data }: { data: Oversight }) {
  return (
    <section aria-labelledby="metrics-heading" className="grid gap-4">
      <div>
        <h2 id="metrics-heading" className="text-lg font-semibold">
          Coverage and review
        </h2>
        <p className="text-sm text-muted-foreground">
          As of {formatDateTime(data.asOf)} · {data.profileName}
          {data.simulation && ' (simulation profile)'} · future obligations are
          excluded from due-report rates.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
      <div className="grid gap-6 rounded-lg border bg-card p-5 lg:grid-cols-2">
        <MetricChart metrics={data.metrics} />
        <Table>
          <TableCaption className="text-left">
            The chart shows the same values as this table.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Metric</TableHead>
              <TableHead scope="col">Numerator</TableHead>
              <TableHead scope="col">Denominator</TableHead>
              <TableHead scope="col">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.metrics.map((metric) => (
              <TableRow key={metric.id}>
                <TableHead scope="row">{metric.label}</TableHead>
                <TableCell className="tabular-nums">
                  {metric.numerator}
                </TableCell>
                <TableCell className="tabular-nums">
                  {metric.denominator}
                </TableCell>
                <TableCell className="tabular-nums">
                  {metric.percent === null
                    ? 'Not applicable'
                    : `${metric.percent}%`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ['Awaiting officer action', data.backlog.awaitingOfficer],
          [
            'Awaiting institution clarification',
            data.backlog.awaitingInstitution,
          ],
          ['Closed without submission', data.backlog.closedNonresponse],
          [
            'Average reviewed implementation',
            data.averageReviewed.points === null
              ? 'Not applicable'
              : `${data.averageReviewed.points} / 60 (${data.averageReviewed.included} finalized quarters of ${data.averageReviewed.expected})`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SupervisorHomePage() {
  const search = route.useSearch();
  const oversight = useQuery(oversightQuery(search));
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const obligations = useQuery(obligationsQuery());
  const assignments = useQuery(assignmentsQuery);
  const officerOf = (id: string) =>
    assignments.data?.find(
      (assignment) => assignment.institutionId === id && !assignment.validTo,
    )?.officerId;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={cycle.data?.label}
        title="Oversight overview"
        description="Reporting and review status for every institution and quarter. Pending work is shown as pending, never as zero."
      />
      <Filters search={search} />
      <QueryView query={oversight} label="oversight metrics">
        {(data) => <Metrics data={data} />}
      </QueryView>
      <section aria-labelledby="coverage-heading" className="grid gap-3">
        <h2 id="coverage-heading" className="text-lg font-semibold">
          Institution-quarter status
        </h2>
        <QueryView query={cycle} label="reporting calendar">
          {(cycleData) => (
            <QueryView query={institutions} label="institutions">
              {(list) => (
                <QueryView query={obligations} label="reporting obligations">
                  {(obligationList) => (
                    <ObligationMatrix
                      caption="All institutions by quarter, with assigned officer"
                      cycle={{
                        ...cycleData,
                        periods: cycleData.periods.filter(
                          (period) =>
                            !search.periodId || period.id === search.periodId,
                        ),
                      }}
                      institutions={list.filter(
                        (institution) =>
                          (!search.institutionId ||
                            institution.id === search.institutionId) &&
                          (!search.officerId ||
                            officerOf(institution.id) === search.officerId),
                      )}
                      obligations={obligationList}
                      assignments={assignments.data}
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
