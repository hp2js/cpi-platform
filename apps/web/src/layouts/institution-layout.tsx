import { useQuery } from '@tanstack/react-query';
import { InboxLink } from '@/components/inbox-link';
import { Link, Outlet } from '@tanstack/react-router';
import {
  Award,
  Bell,
  Building2,
  FileText,
  FolderOpen,
  House,
} from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { SimulationBanner } from '@/components/simulation-banner';
import { stateLabel } from '@/components/status';
import {
  cycleQuery,
  institutionQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { foundationsQuery } from '@/features/foundations/queries';
import { proposalsNeedingAttention } from '@/features/planning/labels';
import { planQuery } from '@/features/planning/queries';
import { useSession } from '@/features/session/use-session';
import {
  AttentionBadge,
  NavList,
  SkipLink,
  useMeasuredHeight,
  type NavItem,
} from './shared';
import { formatCalendarDate } from '@/lib/dates';

// Four sections by task: the same full labels fit the phone bar, so the visible label is the
// accessible name everywhere (WCAG 2.5.3).
const nav = [
  { to: '/institution', label: 'Home', icon: House, exact: true },
  {
    to: '/institution/reports',
    label: 'Reports',
    icon: FileText,
    exact: false,
  },
  {
    to: '/institution/plan',
    label: 'Plan & documents',
    icon: FolderOpen,
    exact: false,
  },
  { to: '/institution/results', label: 'Results', icon: Award, exact: false },
] as const satisfies readonly NavItem[];

// The desktop rail adds the destinations the phone bar reaches from the header.
const railNav = [
  ...nav,
  {
    to: '/institution/profile',
    label: 'Our institution',
    icon: Building2,
    exact: false,
  },
  { to: '/institution/inbox', label: 'Inbox', icon: Bell, exact: false },
] as const satisfies readonly NavItem[];

/** How many things in each section need the focal person now. */
function useAttention(institutionId: string) {
  const session = useSession();
  const obligations = useQuery(obligationsQuery(institutionId));
  const foundations = useQuery(foundationsQuery(institutionId));
  const now = Date.parse(session.clock.businessTime);
  const reports = (obligations.data ?? []).filter(
    (obligation) =>
      obligation.state === 'clarification_requested' ||
      ((obligation.state === 'not_started' || obligation.state === 'draft') &&
        obligation.flags.includes('late')),
  ).length;
  const documents =
    foundations.data && now <= Date.parse(foundations.data.deadline)
      ? foundations.data.indicators.filter(
          (indicator) =>
            !indicator.versions.some((version) => version.status === 'active'),
        ).length
      : 0;
  const plan = useQuery(planQuery(institutionId));
  const proposals = plan.data
    ? proposalsNeedingAttention(plan.data, session.clock.businessTime)
    : 0;
  return {
    '/institution/reports': reports,
    '/institution/plan': documents + proposals,
  } as Partial<Record<(typeof nav)[number]['to'], number>>;
}

/** Who the focal person reports for: the name once loaded, never "DEMO-001 (DEMO-001)". */
function ReportingFor({ institutionId }: { institutionId: string }) {
  const institution = useQuery(institutionQuery(institutionId));
  return (
    <>
      <span className="text-xs font-bold tracking-wide text-base-dark uppercase">
        Reporting for
      </span>{' '}
      <span className="font-bold">
        {institution.data?.name ?? institutionId}
      </span>
      {institution.data && (
        <>
          {' '}
          <span className="text-sm text-base-dark">({institutionId})</span>
        </>
      )}
    </>
  );
}

/**
 * The year at a glance, as the officer rail lists a portfolio: each quarter with its state in
 * words, linking straight to its report.
 */
function QuarterList({ institutionId }: { institutionId: string }) {
  const cycle = useQuery(cycleQuery);
  const obligations = useQuery(obligationsQuery(institutionId));
  return (
    <section aria-labelledby="quarters-heading">
      <h2
        id="quarters-heading"
        className="px-3 text-xs font-bold tracking-wide text-base-dark uppercase"
      >
        {cycle.data ? `${cycle.data.label} quarters` : 'Quarters'}
      </h2>
      <ul className="mt-2 grid gap-1 text-sm">
        {cycle.data?.periods.map((period) => {
          const obligation = obligations.data?.find(
            (item) => item.periodId === period.id,
          );
          const status = !obligation
            ? ''
            : obligation.state === 'not_started' &&
                obligation.flags.includes('not_yet_due')
              ? 'Not yet due'
              : obligation.flags.includes('late') &&
                  (obligation.state === 'not_started' ||
                    obligation.state === 'draft')
                ? `${stateLabel(obligation.state, 'institution')} · late`
                : stateLabel(obligation.state, 'institution');
          return (
            <li key={period.id}>
              <Link
                to="/institution/reports/$periodId"
                params={{ periodId: period.id }}
                className="block min-h-touch border-l-4 border-transparent px-3 py-2 text-ink no-underline hover:bg-base-lightest data-[status=active]:border-primary data-[status=active]:text-primary"
              >
                <span className="block font-bold">
                  {period.label}
                  {obligation?.state === 'clarification_requested' && (
                    <AttentionBadge count={1} />
                  )}
                </span>
                <span className="block text-xs text-base-dark">{status}</span>
                <span className="block text-xs text-base-dark">
                  Due{' '}
                  {formatCalendarDate(period.submissionDeadline.slice(0, 10))}
                </span>
              </Link>
            </li>
          );
        })}
        {cycle.isPending && (
          <li className="px-3 text-xs text-base-dark">Loading quarters…</li>
        )}
      </ul>
    </section>
  );
}

/** The desktop rail: wordmark, whose reports these are, sections and the year's quarters. */
function InstitutionRail({
  institutionId,
  counts,
}: {
  institutionId: string;
  counts: Partial<Record<string, number>>;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <Link
        to="/institution"
        activeOptions={{ exact: true }}
        aria-label="Institution home"
      >
        <Brand />
      </Link>
      <p className="px-3 text-sm">
        <ReportingFor institutionId={institutionId} />
      </p>
      <nav aria-label="Institution">
        <NavList items={railNav} counts={counts} />
      </nav>
      <QuarterList institutionId={institutionId} />
    </div>
  );
}

/**
 * Layout for institution focal persons. From `desktop`, a workspace like the officer's: a rail
 * with the institution, its sections and the year's quarters, and a wide content area for
 * reports. Below it, one column for form entry: tabs on tablets, a bottom bar on phones.
 */
export function InstitutionLayout() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const attention = useAttention(institutionId);
  const bannerRef = useMeasuredHeight<HTMLDivElement>('--banner-h');
  const headerRef = useMeasuredHeight<HTMLElement>('--header-h');
  return (
    <div className="flex min-h-svh flex-col bg-canvas pb-20 tablet:pb-0">
      <SkipLink />
      <div ref={bannerRef} data-sticky className="sticky top-0 z-40">
        <SimulationBanner session={session} />
      </div>
      <div className="flex flex-1">
        <aside
          data-sticky
          className="sticky top-(--banner-h) hidden h-[calc(100svh-var(--banner-h))] w-64 shrink-0 self-start overflow-y-auto border-r bg-white desktop:block"
        >
          <InstitutionRail institutionId={institutionId} counts={attention} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            ref={headerRef}
            data-sticky
            className="sticky top-(--banner-h) z-30 border-b bg-white"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-2 tablet:px-6 desktop:justify-end desktop:px-8">
              <Link
                to="/institution"
                activeOptions={{ exact: true }}
                aria-label="Institution home"
                className="min-w-0 desktop:hidden"
              >
                <Brand />
              </Link>
              <div className="flex items-center gap-1">
                <InboxLink to="/institution/inbox" />
                <AccountMenu session={session} />
              </div>
            </div>
            <p className="px-4 pb-1 tablet:px-6 desktop:hidden">
              <ReportingFor institutionId={institutionId} />
            </p>
            <nav
              aria-label="Institution"
              className="hidden px-4 tablet:block tablet:px-6 desktop:hidden"
            >
              <ul className="flex gap-1">
                {nav.map(({ to, label, exact }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      activeOptions={{ exact }}
                      className="inline-flex min-h-touch items-center border-b-4 border-transparent px-4 py-3 text-sm font-bold text-ink no-underline hover:text-primary data-[status=active]:border-primary data-[status=active]:text-primary"
                    >
                      {label}
                      <AttentionBadge count={attention[to]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-desktop flex-1 px-4 py-6 outline-none tablet:px-6 desktop:mx-0 desktop:max-w-desktop-lg desktop:px-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
      <nav
        aria-label="Institution"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-white tablet:hidden"
      >
        <ul
          className="mx-auto grid max-w-mobile-lg"
          style={{
            gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))`,
          }}
        >
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact }}
                className="flex min-h-14 flex-col items-center justify-center gap-1 border-t-4 border-transparent py-2 text-xs text-ink data-[status=active]:border-primary data-[status=active]:font-bold data-[status=active]:text-primary"
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden="true" />
                  {attention[to] ? (
                    <span className="absolute -top-1.5 -right-2.5">
                      <AttentionBadge count={attention[to]} />
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
