import { useQuery } from '@tanstack/react-query';
import { InboxLink } from '@/components/inbox-link';
import { Link, Outlet } from '@tanstack/react-router';
import {
  Bell,
  ChartColumn,
  ClipboardList,
  FileSearch,
  Menu,
  Scale,
} from 'lucide-react';
import { useState } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { SimulationBanner } from '@/components/simulation-banner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { institutionsQuery } from '@/features/directory/queries';
import { useSession } from '@/features/session/use-session';
import { NavList, SkipLink, useMeasuredHeight, type NavItem } from './shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const nav = [
  { to: '/officer', label: 'Assigned work', icon: ClipboardList, exact: true },
  {
    to: '/officer/portfolio',
    label: 'My portfolio',
    icon: ChartColumn,
    exact: false,
  },
  {
    to: '/officer/evidence',
    label: 'Evidence',
    icon: FileSearch,
    exact: false,
  },
  { to: '/officer/rules', label: 'Rules in use', icon: Scale, exact: false },
  { to: '/officer/inbox', label: 'Inbox', icon: Bell, exact: false },
] as const satisfies readonly NavItem[];

function OfficerRail({ onNavigate }: { onNavigate?: () => void }) {
  const portfolio = useQuery(institutionsQuery);
  // Large portfolios get a filter; the rail scrolls on its own.
  const [filter, setFilter] = useState('');
  const terms = filter.trim().toLowerCase();
  const shown = (portfolio.data ?? []).filter(
    (institution) =>
      !terms ||
      `${institution.id} ${institution.name}`.toLowerCase().includes(terms),
  );
  return (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <Link
        to="/officer"
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        aria-label="Officer home"
      >
        <Brand />
      </Link>
      <nav aria-label="Officer">
        <NavList items={nav} onNavigate={onNavigate} />
      </nav>
      <section aria-labelledby="portfolio-heading">
        <h2
          id="portfolio-heading"
          className="px-3 text-xs font-bold tracking-wide text-base-dark uppercase"
        >
          My portfolio
          {portfolio.data && ` (${portfolio.data.length})`}
        </h2>
        {(portfolio.data?.length ?? 0) > 8 && (
          <div className="mt-2 px-1">
            <Label htmlFor="portfolio-filter" className="sr-only">
              Filter my portfolio
            </Label>
            <Input
              id="portfolio-filter"
              type="search"
              placeholder="Filter institutions"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
        )}
        <ul className="mt-2 grid gap-1 text-sm">
          {shown.map((institution) => (
            <li key={institution.id}>
              <Link
                to="/officer/institutions/$institutionId"
                params={{ institutionId: institution.id }}
                onClick={onNavigate}
                className="block min-h-touch border-l-4 border-transparent px-3 py-2 text-ink hover:bg-base-lightest data-[status=active]:border-primary data-[status=active]:text-primary"
              >
                <span className="block font-bold">{institution.id}</span>
                <span className="block text-xs text-base-dark">
                  {institution.name}
                </span>
              </Link>
            </li>
          ))}
          {portfolio.isPending && (
            <li className="px-3 text-xs text-base-dark">Loading portfolio…</li>
          )}
        </ul>
      </section>
    </div>
  );
}

/**
 * Workspace layout for prevention officers: a persistent rail with the assigned portfolio,
 * and a wide content area for dense review work. The rail becomes a drawer below 1024px.
 */
export function OfficerLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const bannerRef = useMeasuredHeight<HTMLDivElement>('--banner-h');
  const headerRef = useMeasuredHeight<HTMLElement>('--header-h');
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SkipLink />
      <div ref={bannerRef} data-sticky className="sticky top-0 z-40">
        <SimulationBanner session={session} />
      </div>
      <div className="flex flex-1">
        <aside
          data-sticky
          className="sticky top-(--banner-h) hidden h-[calc(100svh-var(--banner-h))] w-64 shrink-0 self-start overflow-y-auto border-r bg-white desktop:block"
        >
          <OfficerRail />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            ref={headerRef}
            data-sticky
            className="sticky top-(--banner-h) z-30 flex items-center justify-between gap-3 border-b bg-white px-4 py-2 desktop:justify-end"
          >
            <div className="flex min-w-0 items-center gap-2 desktop:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="desktop:hidden"
                  >
                    <Menu aria-hidden="true" />
                    <span className="sr-only">Open navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Officer navigation and assigned portfolio
                  </SheetDescription>
                  <OfficerRail onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
              <Link
                to="/officer"
                aria-label="Assigned work"
                className="min-w-0"
              >
                <Brand />
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <InboxLink to="/officer/inbox" />
              <AccountMenu session={session} />
            </div>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="outline-none flex-1 px-4 py-6 desktop:px-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
