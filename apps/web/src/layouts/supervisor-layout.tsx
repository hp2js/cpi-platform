import { Link, Outlet } from '@tanstack/react-router';
import { LayoutDashboard } from 'lucide-react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { SimulationBanner } from '@/components/simulation-banner';
import { useSession } from '@/features/session/use-session';
import { SkipLink, type NavItem } from './shared';

const nav = [
  { to: '/supervisor', label: 'Overview', icon: LayoutDashboard, exact: true },
] as const satisfies readonly NavItem[];

/**
 * Oversight layout for the supervisor: full-width analytics with section tabs. Filters are
 * held in the URL by each screen so views can be shared and refreshed.
 */
export function SupervisorLayout() {
  const session = useSession();
  return (
    <div className="min-h-svh bg-background">
      <SkipLink />
      <SimulationBanner session={session} />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
          <Link to="/supervisor" aria-label="Supervisor overview">
            <Brand />
          </Link>
          <nav
            aria-label="Supervisor"
            className="order-last w-full overflow-x-auto md:order-none md:w-auto md:flex-1"
          >
            <ul className="flex gap-1">
              {nav.map(({ to, label, icon: Icon, exact }) => (
                <li key={to}>
                  <Link
                    to={to}
                    activeOptions={{ exact }}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <AccountMenu session={session} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
