import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow"
    >
      Skip to content
    </a>
  );
}

export interface NavItem {
  to: ComponentProps<typeof Link>['to'];
  label: string;
  icon: LucideIcon;
  /** Match only this path, not its children (for section home links). */
  exact?: boolean;
}

/** Vertical navigation list; the router marks the active link with aria-current="page". */
export function NavList({
  items,
  tone = 'light',
  onNavigate,
}: {
  items: readonly NavItem[];
  tone?: 'light' | 'dark';
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid gap-0.5">
      {items.map(({ to, label, icon: Icon, exact }) => (
        <li key={String(to)}>
          <Link
            to={to}
            onClick={onNavigate}
            activeOptions={{ exact: exact ?? false, includeSearch: false }}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium',
              tone === 'dark'
                ? 'text-primary-foreground/80 hover:bg-white/10 hover:text-primary-foreground data-[status=active]:bg-white/15 data-[status=active]:text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
