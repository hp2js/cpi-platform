import { Link, Outlet } from '@tanstack/react-router';
import {
  Award,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Gauge,
  Mail,
  Menu,
  Ruler,
  ScrollText,
  SlidersHorizontal,
  Stamp,
  UserRound,
  Users,
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
import { useSession } from '@/features/session/use-session';
import {
  NavSections,
  SkipLink,
  useMeasuredHeight,
  type NavSection,
} from './shared';

// In the order an administrator runs a cycle: set it up, bring people in, run the year, then
// publish the results.
const sections = [
  {
    heading: 'Overview',
    items: [{ to: '/admin', label: 'Console', icon: Gauge, exact: true }],
  },
  {
    heading: '1 · Set up the cycle',
    items: [
      {
        to: '/admin/calendar',
        label: 'Reporting calendar',
        icon: CalendarDays,
      },
      {
        to: '/admin/profiles',
        label: 'Scoring profiles',
        icon: SlidersHorizontal,
      },
      { to: '/admin/risk-scale', label: 'Risk rating scale', icon: Ruler },
      { to: '/admin/forms', label: 'Reporting forms', icon: FileText },
    ],
  },
  {
    heading: '2 · People',
    items: [
      { to: '/admin/institutions', label: 'Institutions', icon: Building2 },
      { to: '/admin/users', label: 'Users', icon: UserRound },
      { to: '/admin/assignments', label: 'Assignments', icon: Users },
    ],
  },
  {
    heading: '3 · Run the year',
    items: [
      { to: '/admin/reviews', label: 'Reviews', icon: ClipboardCheck },
      { to: '/admin/notifications', label: 'Notifications', icon: Mail },
      {
        to: '/admin/simulation',
        label: 'Simulation clock',
        icon: CalendarClock,
      },
    ],
  },
  {
    heading: '4 · Publish',
    items: [
      { to: '/admin/report-identity', label: 'Report identity', icon: Stamp },
      { to: '/admin/annual', label: 'Annual evaluation', icon: Award },
    ],
  },
  {
    heading: 'Accountability',
    items: [{ to: '/admin/audit', label: 'Audit log', icon: ScrollText }],
  },
] as const satisfies readonly NavSection[];

function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div
      data-surface="dark"
      className="flex min-h-full flex-col gap-6 bg-primary p-4 text-white"
    >
      <Link
        to="/admin"
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        aria-label="Administration console"
      >
        <Brand tone="dark" />
      </Link>
      <NavSections
        label="Administration"
        sections={sections}
        tone="dark"
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * Console layout for administrators: grouped setup, publication and operations sections.
 * Elevated actions are marked where they occur, never hidden in the navigation.
 */
export function AdminLayout() {
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
          className="sticky top-(--banner-h) hidden h-[calc(100svh-var(--banner-h))] w-64 shrink-0 self-start overflow-y-auto bg-primary desktop:block"
        >
          <AdminSidebar />
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
                <SheetContent
                  side="left"
                  data-surface="dark"
                  className="w-72 border-0 bg-primary p-0 text-white"
                >
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Administration sections
                  </SheetDescription>
                  <AdminSidebar onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
              <Link
                to="/admin"
                aria-label="Administration console"
                className="min-w-0"
              >
                <Brand />
              </Link>
            </div>
            <AccountMenu session={session} />
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
