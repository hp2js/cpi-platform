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
import {
  NavSections,
  RailBrand,
  SkipLink,
  useMeasuredHeight,
  type NavSection,
} from './shared';

// In the order a supervisor oversees the year: see the picture, follow institutions' reporting,
// balance the officers' work, then confirm the year-end results. The rules are for reference.
const sections = [
  {
    heading: 'Overview',
    items: [
      {
        to: '/supervisor',
        label: 'Overview',
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    heading: 'Reporting',
    items: [
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
    heading: 'Year end',
    items: [
      { to: '/supervisor/annual', label: 'Annual readiness', icon: Award },
      { to: '/supervisor/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    heading: 'Reference',
    items: [{ to: '/supervisor/rules', label: 'Rules in use', icon: Scale }],
  },
] as const satisfies readonly NavSection[];

function SupervisorRail({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <RailBrand
        to="/supervisor"
        label="Supervisor overview"
        onNavigate={onNavigate}
      />
      <NavSections
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        label="Supervisor"
        sections={sections}
        onNavigate={onNavigate}
      />
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
    <div className="flex min-h-svh flex-col bg-canvas">
      <SkipLink />
      <div ref={bannerRef} data-sticky className="sticky top-0 z-40">
        <SimulationBanner session={session} />
      </div>
      <div className="flex flex-1">
        <aside
          data-sticky
          className="sticky top-(--banner-h) hidden h-[calc(100svh-var(--banner-h))] w-64 shrink-0 self-start overflow-hidden border-r bg-white desktop:block"
        >
          <SupervisorRail />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            ref={headerRef}
            data-print-hide
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
                <SheetContent side="left" className="w-72 overflow-hidden p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Supervisor sections
                  </SheetDescription>
                  <SupervisorRail onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
              <Link
                to="/supervisor"
                aria-label="Oversight overview"
                className="min-w-0"
              >
                <Brand />
              </Link>
            </div>
            <div className="flex items-center gap-1">
              <InboxLink to="/supervisor/inbox" />
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
