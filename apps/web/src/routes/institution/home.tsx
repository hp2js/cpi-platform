import type {
  Cycle,
  Foundations,
  Obligation,
  Plan,
  Receipt,
  ReportBundle,
} from '@cpi/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CircleCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DeadlineCountdown } from '@/components/deadline-countdown';
import { Glossary } from '@/components/glossary';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { ObligationStatus } from '@/components/status';
import { buttonVariants } from '@/components/ui/button';
import { inboxQuery } from '@/features/events/queries';
import { formsQuery } from '@/features/forms/queries';
import { foundationsQuery } from '@/features/foundations/queries';
import { failedCheckLabels, proposalsDue } from '@/features/planning/labels';
import { planQuery } from '@/features/planning/queries';
import { receiptsQuery, reportQuery } from '@/features/reporting/queries';
import { cycleQuery, obligationsQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { formatDateRange, formatDateTime, formatDays } from '@/lib/dates';

interface Todo {
  key: string;
  title: string;
  detail: ReactNode;
  deadline: string | null;
  action: ReactNode;
}

const arrow = <ArrowRight aria-hidden="true" />;

/**
 * Everything the institution owes now, soonest deadline first: clarifications to answer,
 * reports that are open or late, foundation documents still missing, and baselines to propose.
 */
function buildTodos({
  cycle,
  obligations,
  reports,
  foundations,
  plan,
  formPublished,
  now,
  me,
}: {
  cycle: Cycle;
  obligations: Obligation[];
  reports: Map<string, ReportBundle>;
  foundations: Foundations | undefined;
  plan: Plan | undefined;
  formPublished: boolean;
  now: string;
  me: string;
}): Todo[] {
  const todos: Todo[] = [];
  for (const obligation of obligations) {
    const period = cycle.periods.find(
      (candidate) => candidate.id === obligation.periodId,
    )!;
    const report = reports.get(obligation.id);
    if (obligation.state === 'clarification_requested') {
      const open = report?.clarifications.find(
        (clarification) => clarification.status === 'open',
      );
      todos.push({
        key: `clarify-${obligation.id}`,
        title: `Answer the clarification on your ${period.label} report`,
        detail: open
          ? `${open.items.length} ${open.items.length === 1 ? 'question' : 'questions'} from your reviewing officer. Update the report and submit a new revision.`
          : 'Your reviewing officer has questions. Update the report and submit a new revision.',
        deadline: open?.responseDueAt ?? null,
        action: (
          <Link
            to="/institution/reports/$periodId"
            params={{ periodId: period.id }}
            className={buttonVariants({ size: 'sm' })}
          >
            Respond {arrow}
          </Link>
        ),
      });
      continue;
    }
    if (
      formPublished &&
      !obligation.flags.includes('not_yet_due') &&
      (obligation.state === 'not_started' || obligation.state === 'draft')
    ) {
      const draft = report?.draft;
      todos.push({
        key: `report-${obligation.id}`,
        title:
          obligation.state === 'draft'
            ? `Finish your ${period.label} report`
            : `Submit your ${period.label} report`,
        detail:
          draft?.savedAt && draft.savedBy
            ? `Draft saved ${formatDateTime(draft.savedAt)}${draft.savedBy === me ? ' by you' : ` by ${draft.savedBy}`}.`
            : `For ${formatDateRange(period.startsOn, period.endsOn)}. A late report is still accepted and marked late.`,
        deadline: period.submissionDeadline,
        action: (
          <Link
            to="/institution/reports/$periodId"
            params={{ periodId: period.id }}
            className={buttonVariants({ size: 'sm' })}
          >
            {obligation.state === 'draft' ? 'Continue draft' : 'Start report'}{' '}
            {arrow}
          </Link>
        ),
      });
    }
  }
  const missing =
    foundations?.indicators.filter(
      (indicator) =>
        !indicator.versions.some((version) => version.status === 'active'),
    ) ?? [];
  if (
    foundations &&
    missing.length > 0 &&
    Date.parse(now) <= Date.parse(foundations.deadline)
  )
    todos.push({
      key: 'foundations',
      title: `Upload your ${missing.map((item) => item.label.toLowerCase()).join(', ')}`,
      detail:
        'Procedures, the risk assessment and the mitigation plan are scored once for the year.',
      deadline: foundations.deadline,
      action: (
        <Link
          to="/institution/plan"
          search={{ tab: 'documents' }}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          Open foundations {arrow}
        </Link>
      ),
    });
  for (const proposal of plan ? proposalsDue(plan) : []) {
    const returned = plan!.baselines
      .filter((baseline) => baseline.periodId === proposal.periodId)
      .at(-1)?.returned;
    todos.push({
      key: `propose-${proposal.periodId}`,
      title: returned
        ? `Revise and propose your ${proposal.periodLabel} baseline again`
        : `Propose your ${proposal.periodLabel} baseline`,
      detail: returned
        ? `Returned by ${returned.by}: ${returned.failedChecks.map((check) => failedCheckLabels[check].toLowerCase()).join('; ') || returned.reason}.`
        : proposal.plannedMilestones
          ? `${proposal.plannedMilestones} ${proposal.plannedMilestones === 1 ? 'milestone is' : 'milestones are'} planned. Your officer approves the baseline before the quarter starts.`
          : `Plan the quarter’s milestones and send them to your officer before the quarter starts.`,
      deadline: proposal.dueAt,
      action: (
        <Link
          to="/institution/plan"
          hash={`bl-${proposal.periodId}`}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          Open plan {arrow}
        </Link>
      ),
    });
  }
  return todos.sort(
    (a, b) =>
      (a.deadline ? Date.parse(a.deadline) : Infinity) -
      (b.deadline ? Date.parse(b.deadline) : Infinity),
  );
}

/** The earliest quarter that is not yet due, for the "nothing is due" state. */
function nextDue(cycle: Cycle, obligations: Obligation[]) {
  const upcoming = obligations
    .filter((obligation) => obligation.flags.includes('not_yet_due'))
    .flatMap((obligation) => {
      const period = cycle.periods.find(
        (candidate) => candidate.id === obligation.periodId,
      );
      return period
        ? [{ label: period.label, deadline: period.submissionDeadline }]
        : [];
    })
    .sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  return upcoming[0];
}

function TodoList({
  todos,
  formPublished,
  next,
}: {
  todos: Todo[];
  formPublished: boolean;
  /** The next quarter that will be due, shown when nothing is due now. */
  next?: { label: string; deadline: string };
}) {
  const inbox = useQuery(inboxQuery);
  const unread = inbox.data?.unread ?? 0;
  return (
    <section
      aria-labelledby="todo-heading"
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <h2 id="todo-heading" className="font-bold">
        What needs you
      </h2>
      {todos.length === 0 ? (
        <div className="grid gap-2 text-sm">
          <p className="flex items-center gap-2">
            <CircleCheck
              className="size-5 shrink-0 text-success-darker"
              aria-hidden="true"
            />
            {formPublished
              ? 'Nothing is due right now.'
              : 'The report form has not been published yet. You will be notified when it is; nothing is needed from you until then.'}
          </p>
          {formPublished && next && (
            <p className="flex items-start gap-2">
              <CalendarClock
                className="size-5 shrink-0 text-base-dark"
                aria-hidden="true"
              />
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Next: your <span className="font-bold">{next.label}</span>{' '}
                  report, due{' '}
                  <time dateTime={next.deadline}>
                    {formatDateTime(next.deadline)}
                  </time>
                </span>
                <DeadlineCountdown deadline={next.deadline} />
              </span>
            </p>
          )}
          {unread > 0 && (
            <p>
              <Link to="/institution/inbox" className="usa-link">
                {unread} unread {unread === 1 ? 'message' : 'messages'} in your
                inbox
              </Link>
            </p>
          )}
        </div>
      ) : (
        <ol className="grid gap-3">
          {todos.map((todo) => (
            <li
              key={todo.key}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-white p-4"
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="font-bold">{todo.title}</p>
                <p className="text-sm text-base-dark">{todo.detail}</p>
                {todo.deadline && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="inline-flex items-start gap-2">
                      <CalendarClock
                        className="mt-1 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span>
                        By{' '}
                        <time dateTime={todo.deadline}>
                          {formatDateTime(todo.deadline)}
                        </time>
                      </span>
                    </span>
                    <DeadlineCountdown deadline={todo.deadline} />
                  </p>
                )}
              </div>
              <div className="shrink-0">{todo.action}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** What happened to a quarter, in words: when it was submitted and whether that was late. */
function QuarterOutcome({
  obligation,
  receipts,
}: {
  obligation: Obligation;
  receipts: Receipt[];
}) {
  if (!obligation.firstSubmittedAt) return null;
  const receipt = receipts
    .filter((candidate) => candidate.obligationId === obligation.id)
    .at(-1);
  const late = obligation.daysLate ?? 0;
  return (
    <p className="mt-2 text-sm">
      Submitted {formatDateTime(obligation.firstSubmittedAt)} ·{' '}
      {late > 0 ? (
        <span className="font-bold text-error-dark">
          {formatDays(late, obligation.daysLateUnit)} late
        </span>
      ) : (
        'on time'
      )}
      {receipt && receipt.revision > 1 && ` · revision ${receipt.revision}`}
    </p>
  );
}

function QuarterAction({
  obligation,
  receipts,
  formPublished,
}: {
  obligation: Obligation;
  receipts: Receipt[];
  formPublished: boolean;
}) {
  const receipt = receipts
    .filter((candidate) => candidate.obligationId === obligation.id)
    .at(-1);
  if (obligation.state === 'clarification_requested')
    return (
      <Link
        to="/institution/reports/$periodId"
        params={{ periodId: obligation.periodId }}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Respond to clarification {arrow}
      </Link>
    );
  if (
    receipt &&
    obligation.state !== 'draft' &&
    obligation.state !== 'not_started'
  )
    return (
      <Link
        to="/institution/receipts/$receiptId"
        params={{ receiptId: receipt.id }}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        View receipt
      </Link>
    );
  if (obligation.flags.includes('not_yet_due') || !formPublished) return null;
  if (obligation.state !== 'not_started' && obligation.state !== 'draft')
    return null;
  return (
    <Link
      to="/institution/reports/$periodId"
      params={{ periodId: obligation.periodId }}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {obligation.state === 'draft' ? 'Continue draft' : 'Start report'} {arrow}
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
  const session = useSession();
  // Reports are read only where the to-do list needs them: clarification windows and drafts.
  const active = obligations.filter(
    (obligation) =>
      obligation.state === 'clarification_requested' ||
      obligation.state === 'draft',
  );
  const bundles = useQueries({
    queries: active.map((obligation) => reportQuery(obligation.id)),
  });
  const reports = new Map(
    bundles.flatMap((bundle) =>
      bundle.data ? [[bundle.data.obligation.id, bundle.data] as const] : [],
    ),
  );
  const plan = useQuery(planQuery(session.user.institutionId ?? ''));
  const foundations = useQuery(
    foundationsQuery(session.user.institutionId ?? ''),
  );
  const todos = buildTodos({
    cycle,
    obligations,
    reports,
    foundations: foundations.data,
    plan: plan.data,
    formPublished,
    now: session.clock.businessTime,
    me: session.user.displayName,
  });
  return (
    <div className="grid gap-8">
      <TodoList
        todos={todos}
        formPublished={formPublished}
        next={nextDue(cycle, obligations)}
      />

      <section aria-labelledby="deadlines-heading">
        <h2 id="deadlines-heading" className="text-lg font-bold">
          {cycle.label} reporting obligations
        </h2>
        <p className="mt-1 text-sm text-base-dark">
          Quarterly reports are due{' '}
          {formatDays(cycle.dayCounting.reportingDays, cycle.dayCounting.mode)}{' '}
          after each quarter ends. Procedures, the risk assessment and the
          mitigation plan have their own deadline,{' '}
          <time dateTime={cycle.foundationDeadline}>
            {formatDateTime(cycle.foundationDeadline)}
          </time>
          , which quarterly deadlines do not extend.
        </p>
        <ol className="mt-4 grid gap-3 tablet:grid-cols-2">
          {cycle.periods.map((period) => {
            const obligation = obligations.find(
              (candidate) => candidate.periodId === period.id,
            );
            const open =
              obligation &&
              !obligation.flags.includes('not_yet_due') &&
              (obligation.state === 'not_started' ||
                obligation.state === 'draft');
            return (
              <li key={period.id} className="rounded-lg border bg-white p-4">
                <h3 className="font-bold">
                  {period.label}{' '}
                  <span className="font-normal text-base-dark">
                    · {formatDateRange(period.startsOn, period.endsOn)}
                  </span>
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  Due{' '}
                  <time dateTime={period.submissionDeadline}>
                    {formatDateTime(period.submissionDeadline)}
                  </time>
                  {open && (
                    <DeadlineCountdown deadline={period.submissionDeadline} />
                  )}
                </p>
                {obligation && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ObligationStatus
                        state={obligation.state}
                        audience="institution"
                        flags={obligation.flags.filter(
                          (flag) =>
                            flag !== 'late' || !obligation.firstSubmittedAt,
                        )}
                      />
                    </div>
                    <QuarterOutcome
                      obligation={obligation}
                      receipts={receipts}
                    />
                    <div className="mt-3">
                      <QuarterAction
                        obligation={obligation}
                        receipts={receipts}
                        formPublished={formPublished}
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <Glossary />
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
        description="Results are published after annual evaluation. Until then each quarter shows its status, and your reviewing officer contacts you through clarifications if anything needs fixing."
        actions={
          <Link
            to="/institution/profile"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Building2 aria-hidden="true" />
            Our institution
          </Link>
        }
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
