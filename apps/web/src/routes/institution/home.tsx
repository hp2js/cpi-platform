import type { Cycle, Obligation } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { FlagList, WorkflowStateBadge } from '@/components/status';
import { cycleQuery, obligationsQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { formatDateRange, formatDateTime } from '@/lib/dates';

/** The earliest obligation that is open for reporting and not yet submitted. */
function nextObligation(obligations: Obligation[]) {
  return obligations.find(
    (obligation) =>
      !obligation.flags.includes('not_yet_due') &&
      (obligation.state === 'not_started' || obligation.state === 'draft'),
  );
}

function Overview({
  cycle,
  obligations,
}: {
  cycle: Cycle;
  obligations: Obligation[];
}) {
  const next = nextObligation(obligations);
  const nextPeriod =
    next && cycle.periods.find((period) => period.id === next.periodId);
  return (
    <div className="grid gap-8">
      <section
        aria-labelledby="next-heading"
        className="rounded-xl border bg-card p-5"
      >
        <h2 id="next-heading" className="font-semibold">
          Next action
        </h2>
        {next && nextPeriod ? (
          <div className="mt-2 grid gap-2">
            <p>
              Your <strong>{nextPeriod.label}</strong> quarterly report (
              {formatDateRange(nextPeriod.startsOn, nextPeriod.endsOn)}) is open
              for reporting.
            </p>
            <p className="flex items-center gap-2 text-sm">
              <CalendarClock
                className="size-4 text-primary"
                aria-hidden="true"
              />
              Submit by{' '}
              <time dateTime={nextPeriod.submissionDeadline}>
                {formatDateTime(nextPeriod.submissionDeadline)}
              </time>
            </p>
            <span className="flex flex-wrap items-center gap-2">
              <WorkflowStateBadge state={next.state} audience="institution" />
              <FlagList
                flags={next.flags.filter((flag) => flag !== 'not_yet_due')}
              />
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing is due right now. Upcoming quarters are listed below.
          </p>
        )}
      </section>

      <section aria-labelledby="deadlines-heading">
        <h2 id="deadlines-heading" className="text-lg font-semibold">
          {cycle.label} reporting obligations
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quarterly reports are due within 15 days of each quarter's end.
          Procedures, the risk assessment and the mitigation plan have their own
          deadline,{' '}
          <time dateTime={cycle.foundationDeadline}>
            {formatDateTime(cycle.foundationDeadline)}
          </time>
          , which quarterly deadlines do not extend.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {cycle.periods.map((period) => {
            const obligation = obligations.find(
              (candidate) => candidate.periodId === period.id,
            );
            return (
              <li key={period.id} className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold">
                  {period.label}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {formatDateRange(period.startsOn, period.endsOn)}
                  </span>
                </h3>
                <p className="mt-1 text-sm">
                  Due{' '}
                  <time dateTime={period.submissionDeadline}>
                    {formatDateTime(period.submissionDeadline)}
                  </time>
                </p>
                {obligation && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <WorkflowStateBadge
                      state={obligation.state}
                      audience="institution"
                    />
                    <FlagList flags={obligation.flags} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

export function InstitutionHomePage() {
  const session = useSession();
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(session.user.institutionId));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={cycle.data?.label}
        title="What is due and what needs attention"
        description="Results are published only after annual evaluation. Until then you will see the status of each report and any feedback."
      />
      <QueryView query={cycle} label="reporting calendar">
        {(cycleData) => (
          <QueryView query={obligations} label="reporting obligations">
            {(list) => <Overview cycle={cycleData} obligations={list} />}
          </QueryView>
        )}
      </QueryView>
    </div>
  );
}
