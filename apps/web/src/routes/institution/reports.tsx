import type { Obligation, Period, Receipt, ReportBundle } from '@cpi/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { DeadlineCountdown } from '@/components/deadline-countdown';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationStatus } from '@/components/status';
import { buttonVariants } from '@/components/ui/button';
import { ClarificationCard } from '@/features/clarifications/clarification-card';
import { cycleQuery, obligationsQuery } from '@/features/directory/queries';
import { formsQuery } from '@/features/forms/queries';
import {
  obligationIdFor,
  receiptsQuery,
  reportQuery,
} from '@/features/reporting/queries';
import { useSession } from '@/features/session/use-session';
import { formatDateRange, formatDateTime, formatDays } from '@/lib/dates';

function QuarterAction({
  obligation,
  period,
  formPublished,
}: {
  obligation: Obligation;
  period: Period;
  formPublished: boolean;
}) {
  if (obligation.state === 'clarification_requested')
    return (
      <Link
        to="/institution/reports/$periodId"
        params={{ periodId: period.id }}
        className={buttonVariants()}
      >
        Prepare a revised report <ArrowRight aria-hidden="true" />
      </Link>
    );
  if (
    !formPublished ||
    obligation.flags.includes('not_yet_due') ||
    (obligation.state !== 'not_started' && obligation.state !== 'draft')
  )
    return null;
  return (
    <Link
      to="/institution/reports/$periodId"
      params={{ periodId: period.id }}
      className={buttonVariants()}
    >
      {obligation.state === 'draft' ? 'Continue draft' : 'Start report'}{' '}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function Quarter({
  period,
  obligation,
  report,
  receipts,
  formPublished,
}: {
  period: Period;
  obligation: Obligation;
  report: ReportBundle | undefined;
  receipts: Receipt[];
  formPublished: boolean;
}) {
  const open =
    !obligation.flags.includes('not_yet_due') &&
    (obligation.state === 'not_started' || obligation.state === 'draft');
  const clarifications = [...(report?.clarifications ?? [])].sort(
    (a, b) =>
      Number(b.status === 'open') - Number(a.status === 'open') ||
      Date.parse(b.requestedAt) - Date.parse(a.requestedAt),
  );
  const revisions = receipts
    .filter((receipt) => receipt.obligationId === obligation.id)
    .sort((a, b) => b.revision - a.revision);
  const late = obligation.daysLate ?? 0;
  return (
    <section
      aria-labelledby={`quarter-${period.id}`}
      className="grid gap-4 rounded-lg border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id={`quarter-${period.id}`} className="text-lg font-bold">
            {period.label}{' '}
            <span className="font-normal text-base-dark">
              · {formatDateRange(period.startsOn, period.endsOn)}
            </span>
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            Due{' '}
            <time dateTime={period.submissionDeadline}>
              {formatDateTime(period.submissionDeadline)}
            </time>
            {open && <DeadlineCountdown deadline={period.submissionDeadline} />}
          </p>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <ObligationStatus
              state={obligation.state}
              audience="institution"
              flags={obligation.flags.filter(
                (flag) => flag !== 'late' || !obligation.firstSubmittedAt,
              )}
            />
          </span>
          {obligation.firstSubmittedAt && (
            <p className="text-sm">
              First submitted {formatDateTime(obligation.firstSubmittedAt)} ·{' '}
              {late > 0 ? (
                <span className="font-bold text-error-dark">
                  {formatDays(late, obligation.daysLateUnit)} late
                </span>
              ) : (
                'on time'
              )}
            </p>
          )}
        </div>
        <QuarterAction
          obligation={obligation}
          period={period}
          formPublished={formPublished}
        />
      </div>

      {clarifications.length > 0 && (
        <div className="grid gap-3">
          <h3 className="font-bold">Clarifications</h3>
          {clarifications.map((clarification) => (
            <ClarificationCard
              key={clarification.id}
              clarification={clarification}
              audience="institution"
            />
          ))}
        </div>
      )}

      {revisions.length > 0 && (
        <div className="grid gap-2">
          <h3 className="font-bold">Submitted revisions</h3>
          <ul className="divide-y rounded-md border text-sm">
            {revisions.map((receipt) => (
              <li
                key={receipt.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span>
                  Revision {receipt.revision} · received{' '}
                  {formatDateTime(receipt.receivedAt)} ·{' '}
                  {receipt.timeliness === 'on_time' ? 'on time' : 'late'}
                </span>
                <Link
                  to="/institution/receipts/$receiptId"
                  params={{ receiptId: receipt.id }}
                  className="font-bold text-primary underline-offset-4 hover:underline"
                >
                  View receipt {receipt.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Each quarter's report in one place: its status and deadline, any clarifications and every
 * submitted revision with its receipt. Revisions are kept exactly as received.
 */
export function ReportsPage() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(institutionId));
  const receipts = useQuery(receiptsQuery);
  const forms = useQuery(formsQuery);
  const periods = cycle.data?.periods ?? [];
  const reports = useQueries({
    queries: periods.map((period) =>
      reportQuery(obligationIdFor(institutionId, period.id)),
    ),
  });
  const formPublished = (forms.data ?? []).some(
    (form) => form.status === 'published',
  );
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={cycle.data?.label}
        title="Quarterly reports"
        description="Each quarter's report, its clarifications and every revision you submitted. Submitted revisions are kept exactly as received."
      />
      <QueryView query={obligations} label="reports">
        {(list) => (
          <div className="grid gap-5">
            {periods.map((period, index) => {
              const obligation = list.find(
                (candidate) => candidate.periodId === period.id,
              );
              return obligation ? (
                <Quarter
                  key={period.id}
                  period={period}
                  obligation={obligation}
                  report={reports[index]?.data}
                  receipts={receipts.data ?? []}
                  formPublished={formPublished}
                />
              ) : null;
            })}
          </div>
        )}
      </QueryView>
    </div>
  );
}
