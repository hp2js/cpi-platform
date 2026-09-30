import { useQuery } from '@tanstack/react-query';
import { InboxLink } from '@/components/inbox-link';
import { Link, Outlet } from '@tanstack/react-router';
import { Award, FileText, FolderOpen, House } from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { SimulationBanner } from '@/components/simulation-banner';
import {
  institutionQuery,
  obligationsQuery,
} from '@/features/directory/queries';
import { foundationsQuery } from '@/features/foundations/queries';
import { proposalsNeedingAttention } from '@/features/planning/labels';
import { planQuery } from '@/features/planning/queries';
import { useSession } from '@/features/session/use-session';
import { SkipLink, useMeasuredHeight, type NavItem } from './shared';

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

/** A count people can read, announced with what it means. */
function AttentionBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-secondary-dark px-2 text-2xs leading-5 font-bold text-white">
      {count}
      <span className="sr-only"> needing attention</span>
    </span>
  );
}

/**
 * Task layout for institution focal persons: one institution, one column, optimised for
 * form entry on laptops and phones. Bottom navigation replaces the tab bar on small screens.
 */
export function InstitutionLayout() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const institution = useQuery(institutionQuery(institutionId));
  const attention = useAttention(institutionId);
  const bannerRef = useMeasuredHeight<HTMLDivElement>('--banner-h');
  const headerRef = useMeasuredHeight<HTMLElement>('--header-h');
  return (
    <div className="min-h-svh bg-white pb-20 tablet:pb-0">
      <SkipLink />
      <div ref={bannerRef} data-sticky className="sticky top-0 z-40">
        <SimulationBanner session={session} />
      </div>
      <header
        ref={headerRef}
        data-sticky
        className="sticky top-(--banner-h) z-30 border-b bg-white"
      >
        <div className="mx-auto flex max-w-desktop items-center justify-between gap-4 px-4 pt-3 tablet:px-6">
          <Link
            to="/institution"
            activeOptions={{ exact: true }}
            aria-label="Institution home"
          >
            <Brand />
          </Link>
          <div className="flex items-center gap-1">
            <InboxLink to="/institution/inbox" />
            <AccountMenu session={session} />
          </div>
        </div>
        <p className="mx-auto max-w-desktop px-4 pt-2 pb-1 tablet:px-6">
          <span className="text-xs font-bold tracking-wide text-base-dark uppercase">
            Reporting for
          </span>{' '}
          <span className="font-bold">
            {institution.data?.name ?? institutionId}
          </span>{' '}
          <span className="text-sm text-base-dark">({institutionId})</span>
        </p>
        <nav
          aria-label="Institution"
          className="mx-auto hidden max-w-desktop px-4 tablet:px-6 tablet:block"
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
        className="outline-none mx-auto max-w-desktop px-4 py-6 tablet:px-6"
      >
        <Outlet />
      </main>
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
