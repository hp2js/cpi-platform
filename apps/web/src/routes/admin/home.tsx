import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CircleCheck } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import type { Cycle } from '@cpi/contracts';
import { DeadlineCountdown } from '@/components/deadline-countdown';
import { useSession } from '@/features/session/use-session';
import { assignmentsQuery, cycleQuery } from '@/features/directory/queries';
import { adminAttentionQuery } from '@/features/settings/queries';
import { healthQuery, mockApi } from '@/lib/api';
import { formatDateRange, formatDateTime } from '@/lib/dates';

function SystemStatus() {
  const health = useQuery({ ...healthQuery, retry: false });
  const label = (status: 'up' | 'down') =>
    status === 'up' ? 'Connected' : 'Unavailable';
  return (
    <section
      aria-labelledby="system-heading"
      className="rounded-lg border bg-white p-5"
    >
      <h2 id="system-heading" className="font-bold">
        Backend services
      </h2>
      <p className="mt-1 text-sm text-base-dark">
        Live readiness of the API's database and cache.{' '}
        {mockApi
          ? 'Screens in this development build use the in-browser mock API.'
          : 'Screens use this API.'}
      </p>
      {health.data ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-base-dark">PostgreSQL</dt>
          <dd>{label(health.data.services.database)}</dd>
          <dt className="text-base-dark">Redis</dt>
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
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <h2 id="attention-heading" className="font-bold">
        What needs you
      </h2>
      <QueryView query={attention} label="items needing attention">
        {(items) =>
          items.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-base-dark">
              <CircleCheck className="size-4 text-primary" aria-hidden="true" />
              Nothing needs you right now.
            </p>
          ) : (
            <ul className="grid gap-2 tablet:grid-cols-2">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.link}
                    className="group flex h-full items-start gap-3 rounded-lg border p-3 hover:border-primary hover:bg-primary-lighter"
                  >
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-error-dark px-2 py-1 text-sm font-bold text-white tabular-nums">
                      {item.count}
                    </span>
                    <span className="grid gap-1">
                      <span className="font-bold">{item.title}</span>
                      <span className="text-sm text-base-dark">
                        {item.detail}
                      </span>
                    </span>
                    <ArrowRight
                      className="ml-auto size-4 shrink-0 self-center text-base-dark group-hover:text-primary"
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

/** The next dates after business time: the console shows what is next, the calendar page the rest. */
function ComingUp({ cycle, now }: { cycle: Cycle; now: string }) {
  const events = [
    ...cycle.periods.map((period) => ({
      at: period.submissionDeadline,
      title: `${period.label} reports due`,
      detail: formatDateRange(period.startsOn, period.endsOn),
    })),
    {
      at: cycle.foundationDeadline,
      title: 'Foundations due',
      detail: 'Procedures, risk assessment and mitigation plan',
    },
    {
      at: cycle.evaluationCutoff,
      title: 'Evaluation cutoff',
      detail: 'Simulated demonstration setting, not an official EACC deadline',
    },
  ]
    .filter((event) => Date.parse(event.at) > Date.parse(now))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, 3);
  if (events.length === 0)
    return <p className="text-sm">No dates remain in {cycle.label}.</p>;
  return (
    <ol className="grid gap-3 tablet:grid-cols-3">
      {events.map((event) => (
        <li
          key={event.title}
          className="grid gap-1 rounded-lg border-2 border-base-lighter bg-white p-4"
        >
          <p className="font-bold">{event.title}</p>
          <p className="text-sm">
            <time dateTime={event.at}>{formatDateTime(event.at)}</time>
          </p>
          <DeadlineCountdown deadline={event.at} />
          <p className="text-xs text-base-dark">{event.detail}</p>
        </li>
      ))}
    </ol>
  );
}

export function AdminHomePage() {
  const session = useSession();
  const cycle = useQuery(cycleQuery);
  const assignments = useQuery(assignmentsQuery);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Administration"
        title="Console"
        description="What needs you, what is coming up, officer portfolios and system status."
      />
      <Attention />

      <section aria-labelledby="calendar-heading" className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="calendar-heading" className="text-lg font-bold">
            Coming up
          </h2>
          <Link to="/admin/calendar" className="text-sm usa-link">
            Full reporting calendar
          </Link>
        </div>
        <QueryView query={cycle} label="reporting calendar">
          {(data) => <ComingUp cycle={data} now={session.clock.businessTime} />}
        </QueryView>
      </section>

      <div className="grid items-start gap-6 widescreen:grid-cols-[2fr_1fr]">
        <section aria-labelledby="assignments-heading" className="grid gap-3">
          <h2 id="assignments-heading" className="text-lg font-bold">
            Officer portfolios
          </h2>
          <QueryView query={assignments} label="officer assignments">
            {(list) => (
              // Counts, not lists: a portfolio can hold hundreds of institutions.
              <ul className="grid gap-2 tablet:grid-cols-2">
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
                      className="flex items-center justify-between gap-3 rounded-lg border bg-white p-4"
                    >
                      <span className="font-bold">{officer}</span>
                      <span className="text-sm text-base-dark tabular-nums">
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
