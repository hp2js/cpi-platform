import { useQuery } from '@tanstack/react-query';
import { InboxLink } from '@/components/inbox-link';
import { Link, Outlet } from '@tanstack/react-router';
import { Bell, ClipboardList, Menu } from 'lucide-react';
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
import { NavList, SkipLink, type NavItem } from './shared';

const nav = [
  { to: '/officer', label: 'Assigned work', icon: ClipboardList, exact: true },
  { to: '/officer/inbox', label: 'Inbox', icon: Bell, exact: false },
] as const satisfies readonly NavItem[];

function OfficerRail({ onNavigate }: { onNavigate?: () => void }) {
  const portfolio = useQuery(institutionsQuery);
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/officer" onClick={onNavigate} aria-label="Officer home">
        <Brand />
      </Link>
      <nav aria-label="Officer">
        <NavList items={nav} onNavigate={onNavigate} />
      </nav>
      <section aria-labelledby="portfolio-heading">
        <h2
          id="portfolio-heading"
          className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          My portfolio
        </h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {portfolio.data?.map((institution) => (
            <li key={institution.id}>
              <Link
                to="/officer/institutions/$institutionId"
                params={{ institutionId: institution.id }}
                onClick={onNavigate}
                className="block rounded-md px-3 py-1.5 hover:bg-accent data-[status=active]:bg-accent"
              >
                <span className="block font-medium">{institution.id}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {institution.name}
                </span>
              </Link>
            </li>
          ))}
          {portfolio.isPending && (
            <li className="px-3 text-xs text-muted-foreground">
              Loading portfolio…
            </li>
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
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SkipLink />
      <SimulationBanner session={session} />
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
          <OfficerRail />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2 lg:justify-end">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
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
            <div className="flex items-center gap-1">
              <InboxLink to="/officer/inbox" />
              <AccountMenu session={session} />
            </div>
          </header>
          <main id="main" className="flex-1 px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
