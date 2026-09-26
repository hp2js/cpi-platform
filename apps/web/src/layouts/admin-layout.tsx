import { Link, Outlet } from '@tanstack/react-router';
import { FileText, Gauge, Menu } from 'lucide-react';
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
import { NavList, SkipLink, type NavItem } from './shared';

const sections = [
  {
    heading: 'Overview',
    items: [{ to: '/admin', label: 'Console', icon: Gauge, exact: true }],
  },
  {
    heading: 'Forms & scoring',
    items: [{ to: '/admin/forms', label: 'Reporting forms', icon: FileText }],
  },
] as const satisfies readonly { heading: string; items: readonly NavItem[] }[];

function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-primary p-4 text-primary-foreground">
      <Link
        to="/admin"
        onClick={onNavigate}
        aria-label="Administration console"
      >
        <Brand tone="dark" />
      </Link>
      <nav aria-label="Administration" className="grid gap-5">
        {sections.map((section) => (
          <div key={section.heading}>
            <p className="px-3 text-xs font-semibold tracking-wide text-primary-foreground/60 uppercase">
              {section.heading}
            </p>
            <div className="mt-1.5">
              <NavList
                items={section.items}
                tone="dark"
                onNavigate={onNavigate}
              />
            </div>
          </div>
        ))}
      </nav>
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
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SkipLink />
      <SimulationBanner session={session} />
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 lg:block">
          <AdminSidebar />
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
              <SheetContent side="left" className="w-72 border-0 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Administration sections
                </SheetDescription>
                <AdminSidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
            <AccountMenu session={session} />
          </header>
          <main id="main" className="flex-1 px-4 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
