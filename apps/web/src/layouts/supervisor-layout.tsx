import { Link, Outlet } from '@tanstack/react-router';
import {
  Award,
  Building2,
  FileSearch,
  FileText,
  Inbox,
  LayoutDashboard,
  Menu,
  Scale,
  UserCog,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { AccountMenu } from '@/components/account-menu';
import { Brand } from '@/components/brand';
import { InboxLink } from '@/components/inbox-link';
import { SimulationBanner } from '@/components/simulation-banner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSession } from '@/features/session/use-session';
import { NavList, SkipLink, useMeasuredHeight, type NavItem } from './shared';

const sections = [
  {
    heading: 'Oversight',
    items: [
      {
        to: '/supervisor',
        label: 'Overview',
        icon: LayoutDashboard,
        exact: true,
      },
      {
        to: '/supervisor/institutions',
        label: 'Institutions',
        icon: Building2,
      },
      { to: '/supervisor/submissions', label: 'Submissions', icon: Inbox },
      { to: '/supervisor/evidence', label: 'Evidence', icon: FileSearch },
    ],
  },
  {
    heading: 'Officers',
    items: [
      { to: '/supervisor/workload', label: 'Workload', icon: Users },
      { to: '/supervisor/assignments', label: 'Assignments', icon: UserCog },
    ],
  },
  {
    heading: 'Rules & results',
    items: [
      { to: '/supervisor/rules', label: 'Rules in use', icon: Scale },
      { to: '/supervisor/annual', label: 'Annual readiness', icon: Award },
      { to: '/supervisor/reports', label: 'Reports', icon: FileText },
    ],
  },
] as const satisfies readonly { heading: string; items: readonly NavItem[] }[];

function SupervisorRail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex min-h-full flex-col gap-6 p-4">
      <Link
        to="/supervisor"
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        aria-label="Supervisor overview"
      >
        <Brand />
      </Link>
      <nav aria-label="Supervisor" className="grid gap-5">
        {sections.map((section) => (
          <div key={section.heading}>
            <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.heading}
            </p>
            <div className="mt-1.5">
              <NavList items={section.items} onNavigate={onNavigate} />
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * Oversight layout for the supervisor: grouped sections in a rail, and a wide content area for
 * analytics. Filters are held in the URL by each screen so views can be shared and refreshed.
 * The rail becomes a drawer below 1024px.
 */
export function SupervisorLayout() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const bannerRef = useMeasuredHeight<HTMLDivElement>('--banner-h');
  const headerRef = useMeasuredHeight<HTMLElement>('--header-h');
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SkipLink />
      <div ref={bannerRef} data-sticky className="sticky top-0 z-40">
        <SimulationBanner session={session} />
      </div>
      <div className="flex flex-1">
        <aside
          data-sticky
          className="sticky top-(--banner-h) hidden h-[calc(100svh-var(--banner-h))] w-64 shrink-0 self-start overflow-y-auto border-r bg-card lg:block"
        >
          <SupervisorRail />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            ref={headerRef}
            data-sticky
            className="sticky top-(--banner-h) z-30 flex items-center justify-between gap-3 border-b bg-card px-4 py-2 lg:justify-end"
          >
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
                  Supervisor sections
                </SheetDescription>
                <SupervisorRail onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-1">
              <InboxLink to="/supervisor/inbox" />
              <AccountMenu session={session} />
            </div>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="outline-none flex-1 px-4 py-6 lg:px-8"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
