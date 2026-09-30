import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-6 focus:py-4 focus:text-primary focus:underline"
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
/** A count people can read, announced with what it means. */
export function AttentionBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-secondary-dark px-2 text-2xs leading-5 font-bold text-white">
      {count}
      <span className="sr-only"> needing attention</span>
    </span>
  );
}

export function NavList({
  items,
  tone = 'light',
  onNavigate,
  counts,
}: {
  items: readonly NavItem[];
  tone?: 'light' | 'dark';
  onNavigate?: () => void;
  /** Things needing attention per destination, shown as a badge after the label. */
  counts?: Partial<Record<string, number>>;
}) {
  return (
    <ul className="grid">
      {items.map(({ to, label, icon: Icon, exact }) => (
        <li key={String(to)}>
          <Link
            to={to}
            onClick={onNavigate}
            activeOptions={{ exact: exact ?? false, includeSearch: false }}
            className={cn(
              // USWDS side navigation: the current item has a 4 px bar and bold text, not colour alone.
              'flex min-h-touch items-center gap-3 border-l-4 border-transparent px-3 py-2 text-sm',
              tone === 'dark'
                ? 'text-white hover:bg-white/10 data-[status=active]:border-white data-[status=active]:bg-white/10 data-[status=active]:font-bold'
                : 'text-ink hover:bg-base-lightest hover:text-primary data-[status=active]:border-primary data-[status=active]:font-bold data-[status=active]:text-primary',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {label}
            <AttentionBadge count={counts?.[String(to)]} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Measures an element into a CSS variable on the root, so the fixed banner and header can be
 * stacked and in-page sticky bars can sit below them (`top-(--sticky-top)`).
 */
export function useMeasuredHeight<T extends HTMLElement>(
  variable: '--banner-h' | '--header-h',
) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(variable, `${element.offsetHeight}px`);
    update();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(variable);
    };
  }, [variable]);
  return ref;
}
