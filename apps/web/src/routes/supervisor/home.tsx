import type { Metric, Oversight } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Combobox } from '@/components/combobox';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/select-field';
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
import { Trends } from '@/features/oversight/trends';
import {
  oversightQuery,
  type OversightSearch,
} from '@/features/oversight/queries';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { planningWorkQuery } from '@/features/planning/queries';
import { PlanningWorkList } from '@/features/planning/work-list';

const route = getRouteApi('/authed/supervisor/');

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="grid gap-1 rounded-lg border border-base-lighter bg-white p-4">
      <p className="text-sm font-bold">{metric.label}</p>
      {/* "Not applicable" is a fact, not a result: it gets body size, not a headline. */}
      <p
        className={
          metric.percent === null
            ? 'text-md text-base-dark'
            : 'text-xl font-bold tabular-nums'
        }
      >
        {metric.percent === null ? 'Not applicable' : `${metric.percent}%`}
      </p>
      <p className="text-sm tabular-nums">
        {metric.numerator} of {metric.denominator}
      </p>
      <p className="text-xs text-base-dark">{metric.definition}</p>
    </div>
  );
}

/** Filters live in the URL so a shared link reproduces the same view. */
function Filters({ search }: { search: OversightSearch }) {
  const navigate = useNavigate();
  const cycle = useQuery(cycleQuery);
  const institutions = useQuery(institutionsQuery);
  const assignments = useQuery(assignmentsQuery);
  const set = (patch: Partial<OversightSearch>) =>
    void navigate({
      to: '/supervisor',
      search: { ...search, ...patch },
      replace: true,
    });
  // Officers who currently hold a portfolio; the supervisor reads assignments, not accounts.
  const officers = [
    ...new Map(
      (assignments.data ?? [])
        .filter((assignment) => !assignment.validTo)
        .map((assignment) => [
          assignment.officerId,
          { value: assignment.officerId, label: assignment.officerName },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <form
      role="search"
      aria-label="Filter oversight"
      className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid w-40 gap-2">
        <Label htmlFor="filter-period">Quarter</Label>
        <SelectField
          id="filter-period"
          value={search.periodId ?? ''}
          onChange={(value) => set({ periodId: value || undefined })}
          options={[
            { value: '', label: 'All quarters' },
            ...(cycle.data?.periods ?? []).map((period) => ({
              value: period.id,
              label: period.label,
            })),
          ]}
        />
      </div>
      <div className="grid w-full gap-2 tablet:w-80">
        <Label htmlFor="filter-institution">Institution</Label>
        <Combobox
          id="filter-institution"
          allOption="All institutions"
          searchPlaceholder="Search institutions"
          value={search.institutionId ?? ''}
          onChange={(value) => set({ institutionId: value || undefined })}
          options={(institutions.data ?? []).map((institution) => ({
            value: institution.id,
            label: institution.id,
            description: institution.name,
          }))}
        />
      </div>
      <div className="grid w-full gap-2 tablet:w-64">
        <Label htmlFor="filter-officer">Officer</Label>
        <Combobox
          id="filter-officer"
          allOption="All officers"
          searchPlaceholder="Search officers"
          value={search.officerId ?? ''}
          onChange={(value) => set({ officerId: value || undefined })}
          options={officers}
        />
      </div>
    </form>
  );
}

/**
 * What the supervisor acts on (PRD §11: coverage and bottlenecks), first on the page. Each
 * count says whose move it is and opens the submissions list.
 */
function NeedsAttention({ data }: { data: Oversight }) {
  // Plan work is counted across the supervisor's institutions (HP2-52).
  const work = useQuery(planningWorkQuery);
  const planTotals = work.data?.totals ?? { items: 0, flagged: 0 };
  const pastTarget = data.trends.reduce(
    (sum, point) => sum + point.reviewOverdue,
    0,
  );
  const items = [
    {
      label: 'Past the review target',
      detail: `Over ${data.reviewTarget.days} ${data.reviewTarget.unit === 'working' ? 'working days' : 'days'} from receipt without a final decision`,
      count: pastTarget,
      urgent: true,
    },
    {
      label: 'Awaiting officer action',
      detail: 'Submitted and waiting for the assigned officer',
      count: data.backlog.awaitingOfficer,
      urgent: false,
    },
    {
      label: 'Awaiting institution clarification',
      detail: 'The officer asked a question; the institution must answer',
      count: data.backlog.awaitingInstitution,
      urgent: false,
    },
    {
      label: 'Plans and documents awaiting officer',
      detail:
        planTotals.flagged > 0
          ? `Baselines, amendments and foundation documents across your institutions; ${planTotals.flagged} urgent`
          : 'Baselines, amendments and foundation documents across your institutions',
      count: planTotals.items,
      urgent: planTotals.flagged > 0,
      plans: true,
    },
  ];
  const flaggedItems = work.data?.items.filter((item) => item.flag) ?? [];
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <section aria-labelledby="attention-heading" className="grid gap-3">
      <h2 id="attention-heading" className="text-lg font-bold">
        Needs attention
      </h2>
      {total === 0 ? (
        <p className="flex items-center gap-2 text-sm">
          <CircleCheck
            className="size-5 shrink-0 text-success-darker"
            aria-hidden="true"
          />
          Nothing is waiting on review or plan approval in this view.
        </p>
      ) : (
        <>
          <ul className="grid gap-3 tablet:grid-cols-2 widescreen:grid-cols-4">
            {items.map((item) => (
              <li
                key={item.label}
                className={cn(
                  'grid gap-1 border border-base-lighter bg-white p-4',
                  item.count > 0 &&
                    (item.urgent
                      ? 'border-l-8 border-l-error'
                      : 'border-l-8 border-l-warning'),
                )}
              >
                <p className="text-sm font-bold">{item.label}</p>
                <p className="text-xl font-bold tabular-nums">{item.count}</p>
                <p className="text-xs text-base-dark">{item.detail}</p>
                {item.count > 0 &&
                  ('plans' in item ? (
                    <Link
                      to="/supervisor/workload"
                      className="mt-1 text-sm usa-link"
                    >
                      View officer workload
                      <span className="sr-only">
                        {' '}
                        {item.label.toLowerCase()}
                      </span>
                    </Link>
                  ) : (
                    <Link
                      to="/supervisor/submissions"
                      className="mt-1 text-sm usa-link"
                    >
                      View submissions
                      <span className="sr-only">
                        {' '}
                        {item.label.toLowerCase()}
                      </span>
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
          {flaggedItems.length > 0 && (
            <PlanningWorkList
              items={flaggedItems}
              audience="supervisor"
              caption="Urgent plan work waiting on officers"
            />
          )}
        </>
      )}
    </section>
  );
}

function Metrics({ data }: { data: Oversight }) {
  // A chart of zeros and "not applicable" says nothing the table does not.
  const charted = data.metrics.some((metric) => metric.numerator > 0);
  return (
    <section aria-labelledby="metrics-heading" className="grid gap-4">
      <div>
        <h2 id="metrics-heading" className="text-lg font-bold">
          Coverage and review
        </h2>
        <p className="text-sm text-base-dark">
          As of {formatDateTime(data.asOf)} · {data.profileName}
          {data.simulation && ' (simulation profile)'} · future obligations are
          excluded from due-report rates.
        </p>
      </div>
      <div className="grid gap-3 tablet:grid-cols-2 widescreen:grid-cols-5">
        {data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
      <div
        className={cn(
          'grid gap-6 rounded-lg border border-base-lighter bg-white p-5',
          charted && 'desktop:grid-cols-2',
        )}
      >
        {charted && <MetricChart metrics={data.metrics} />}
        <Table>
          {charted && (
            <TableCaption className="text-left">
              The chart shows the same values as this table.
            </TableCaption>
          )}
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
      <dl className="grid gap-3 tablet:grid-cols-2">
        {[
          {
            label: 'Closed without submission',
            value: data.backlog.closedNonresponse,
          },
          {
            label: 'Average reviewed implementation',
            value:
              data.averageReviewed.points === null
                ? 'Not applicable'
                : `${data.averageReviewed.points} / ${data.averageReviewed.maxPoints}`,
            detail: `${data.averageReviewed.included} of ${data.averageReviewed.expected} institution-quarters finalized`,
          },
        ].map(({ label, value, detail }) => (
          <div
            key={label}
            className="rounded-lg border border-base-lighter bg-white p-4"
          >
            <dt className="text-sm text-base-dark">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
            {detail && <dd className="text-sm text-base-dark">{detail}</dd>}
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
        description="Reporting and review status for the institutions assigned to you, by quarter. Pending work is shown as pending, never as zero."
      />
      <Filters search={search} />
      <QueryView query={oversight} label="oversight metrics">
        {(data) => (
          <>
            <NeedsAttention data={data} />
            <Metrics data={data} />
            <Trends data={data} />
          </>
        )}
      </QueryView>
      <section aria-labelledby="coverage-heading" className="grid gap-3">
        <h2 id="coverage-heading" className="text-lg font-bold">
          Institution-quarter status
        </h2>
        <QueryView query={cycle} label="reporting calendar">
          {(cycleData) => (
            <QueryView query={institutions} label="institutions">
              {(list) => (
                <QueryView query={obligations} label="reporting obligations">
                  {(obligationList) => (
                    <ObligationMatrix
                      linkToInstitution="supervisor"
                      caption="Your institutions by quarter, with assigned officer"
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
