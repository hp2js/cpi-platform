import type { Cycle, Obligation, Receipt } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { FlagList, WorkflowStateBadge } from '@/components/status';
import { buttonVariants } from '@/components/ui/button';
import { formsQuery } from '@/features/forms/queries';
import { receiptsQuery, reportQuery } from '@/features/reporting/queries';
import { cycleQuery, obligationsQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { formatDateRange, formatDateTime, formatDays } from '@/lib/dates';

/** The earliest obligation that is open for reporting and not yet submitted. */
function nextObligation(obligations: Obligation[]) {
  const clarification = obligations.find(
    (obligation) => obligation.state === 'clarification_requested',
  );
  if (clarification) return clarification;
  return obligations.find(
    (obligation) =>
      !obligation.flags.includes('not_yet_due') &&
      (obligation.state === 'not_started' || obligation.state === 'draft'),
  );
}

/** The one action that moves an obligation forward, if any. */
function ObligationAction({
  obligation,
  receipts,
  formPublished,
  primary,
}: {
  obligation: Obligation;
  receipts: Receipt[];
  formPublished: boolean;
  primary?: boolean;
}) {
  const variant = primary ? 'default' : 'outline';
  const receipt = receipts.find(
    (candidate) => candidate.obligationId === obligation.id,
  );
  if (obligation.state === 'clarification_requested') {
    return (
      <Link
        to="/institution/reports/$periodId"
        params={{ periodId: obligation.periodId }}
        className={buttonVariants({
          variant,
          size: primary ? 'default' : 'sm',
        })}
      >
        Respond to clarification
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  }
  if (
    receipt &&
    obligation.state !== 'draft' &&
    obligation.state !== 'not_started'
  ) {
    return (
      <Link
        to="/institution/receipts/$receiptId"
        params={{ receiptId: receipt.id }}
        className={buttonVariants({
          variant: 'outline',
          size: primary ? 'default' : 'sm',
        })}
      >
        View receipt
      </Link>
    );
  }
  if (obligation.flags.includes('not_yet_due') || !formPublished) return null;
  if (obligation.state !== 'not_started' && obligation.state !== 'draft')
    return null;
  return (
    <Link
      to="/institution/reports/$periodId"
      params={{ periodId: obligation.periodId }}
      className={buttonVariants({ variant, size: primary ? 'default' : 'sm' })}
    >
      {obligation.state === 'draft' ? 'Continue draft' : 'Start report'}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function Overview({
  cycle,
  obligations,
  receipts,
  formPublished,
}: {
  cycle: Cycle;
  obligations: Obligation[];
  receipts: Receipt[];
  formPublished: boolean;
}) {
  const next = nextObligation(obligations);
  const nextPeriod =
    next && cycle.periods.find((period) => period.id === next.periodId);
  // A clarification has its own, shorter response window (PRD §7.3); show that deadline.
  const clarifying = next?.state === 'clarification_requested';
  const bundle = useQuery({
    ...reportQuery(next?.id ?? ''),
    enabled: clarifying,
  });
  const openClarification = bundle.data?.clarifications.find(
    (clarification) => clarification.status === 'open',
  );
  const deadline = clarifying
    ? openClarification?.responseDueAt
    : nextPeriod?.submissionDeadline;
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
              {clarifying ? (
                <>
                  Your officer has questions about your{' '}
                  <strong>{nextPeriod.label}</strong> report. Answer them by
                  updating the report and submitting a new revision.
                </>
              ) : (
                <>
                  Your <strong>{nextPeriod.label}</strong> quarterly report (
                  {formatDateRange(nextPeriod.startsOn, nextPeriod.endsOn)}) is
                  open for reporting.
                </>
              )}
            </p>
            {deadline && (
              <p className="flex items-center gap-2 text-sm">
                <CalendarClock
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                {clarifying ? 'Respond by' : 'Submit by'}{' '}
                <time dateTime={deadline}>{formatDateTime(deadline)}</time>
              </p>
            )}
            <span className="flex flex-wrap items-center gap-2">
              <WorkflowStateBadge state={next.state} audience="institution" />
              <FlagList
                flags={next.flags.filter((flag) => flag !== 'not_yet_due')}
              />
            </span>
            {formPublished ? (
              <div className="mt-2">
                <ObligationAction
                  obligation={next}
                  receipts={receipts}
                  formPublished
                  primary
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The report form has not been published yet. You will be notified
                when it is; nothing is needed from you until then.
              </p>
            )}
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
          Quarterly reports are due{' '}
          {formatDays(cycle.dayCounting.reportingDays, cycle.dayCounting.mode)}{' '}
          after each quarter ends. Procedures, the risk assessment and the
          mitigation plan have their own deadline,{' '}
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
                {obligation && (
                  <div className="mt-3">
                    <ObligationAction
                      obligation={obligation}
                      receipts={receipts}
                      formPublished={formPublished}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section
        aria-labelledby="terms-heading"
        className="rounded-lg border bg-card p-5 text-sm"
      >
        <h2 id="terms-heading" className="font-semibold">
          Terms used here
        </h2>
        <dl className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
          <dt className="font-medium">CPC</dt>
          <dd className="text-muted-foreground">
            Corruption Prevention Committee: the institution's committee that
            oversees prevention work. Its signed quarterly minutes go with each
            report.
          </dd>
          <dt className="font-medium">IAO</dt>
          <dd className="text-muted-foreground">
            Integrity Assurance Officers: the officers who carry out integrity
            assurance. Their signed quarterly meeting minutes go with each
            report.
          </dd>
          <dt className="font-medium">CRAMP</dt>
          <dd className="text-muted-foreground">
            Corruption Risk Assessment and Mitigation Plan: your approved plan.
            Each quarter is scored against the milestones in its locked
            baseline.
          </dd>
          <dt className="font-medium">Baseline</dt>
          <dd className="text-muted-foreground">
            The milestones your officer approved for a quarter before it opened.
            They cannot be removed to improve a result.
          </dd>
        </dl>
      </section>
    </div>
  );
}

export function InstitutionHomePage() {
  const session = useSession();
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(session.user.institutionId));
  const receipts = useQuery(receiptsQuery);
  const forms = useQuery(formsQuery);
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
            {(list) => (
              <Overview
                cycle={cycleData}
                obligations={list}
                receipts={receipts.data ?? []}
                formPublished={(forms.data ?? []).some(
                  (form) => form.status === 'published',
                )}
              />
            )}
          </QueryView>
        )}
      </QueryView>
    </div>
  );
}
