import { useQuery } from '@tanstack/react-query';
import { InboxLink } from '@/components/inbox-link';
import { Link, Outlet } from '@tanstack/react-router';
import {
  FolderOpen,
  History,
  House,
  ListChecks,
  MessageCircleQuestion,
} from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { SimulationBanner } from '@/components/simulation-banner';
import { institutionQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { SkipLink, type NavItem } from './shared';

const nav = [
  { to: '/institution', label: 'Home', icon: House, exact: true },
  { to: '/institution/plan', label: 'Plan', icon: ListChecks, exact: false },
  {
    to: '/institution/foundations',
    label: 'Foundations',
    icon: FolderOpen,
    exact: false,
  },
  {
    to: '/institution/clarifications',
    label: 'Clarifications',
    icon: MessageCircleQuestion,
    exact: false,
  },
  {
    to: '/institution/receipts',
    label: 'Receipts',
    icon: History,
    exact: false,
  },
] as const satisfies readonly NavItem[];

/**
 * Task layout for institution focal persons: one institution, one column, optimised for
 * form entry on laptops and phones. Bottom navigation replaces the tab bar on small screens.
 */
export function InstitutionLayout() {
  const session = useSession();
  const institutionId = session.user.institutionId ?? '';
  const institution = useQuery(institutionQuery(institutionId));
  return (
    <div className="min-h-svh bg-background pb-20 md:pb-0">
      <SkipLink />
      <SimulationBanner session={session} />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <Link to="/institution" aria-label="Institution home">
            <Brand />
          </Link>
          <div className="flex items-center gap-1">
            <InboxLink to="/institution/inbox" />
            <AccountMenu session={session} />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pt-3 pb-1 sm:px-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Reporting for
          </p>
          <p className="text-lg font-semibold">
            {institution.data?.name ?? institutionId}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({institutionId})
            </span>
          </p>
        </div>
        <nav
          aria-label="Institution"
          className="mx-auto hidden max-w-5xl px-4 sm:px-6 md:block"
        >
          <ul className="flex gap-1">
            {nav.map(({ to, label, exact }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact }}
                  className="inline-block border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <nav
        aria-label="Institution"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card md:hidden"
      >
        <ul
          className="mx-auto grid max-w-md"
          style={{
            gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))`,
          }}
        >
          {nav.map(({ to, label, icon: Icon, exact }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact }}
                className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-primary"
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
