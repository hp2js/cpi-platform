import { Link } from '@tanstack/react-router';
import { Brand } from '@/components/brand';
import type { LucideIcon } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';
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

/** A stage of a persona's work in the rail: a heading, its destinations, and anything listed under them. */
export interface NavSection {
  heading: string;
  items: readonly NavItem[];
  /** Shown after the section's links, such as the year's quarters under Reports. */
  extra?: ReactNode;
}

/**
 * The rail's navigation, grouped in the order the persona works: each stage is a labelled
 * group, so screen readers announce where in the workflow a link sits.
 */
export function NavSections({
  label,
  sections,
  tone = 'light',
  onNavigate,
  counts,
  className,
}: {
  className?: string;
  label: string;
  sections: readonly NavSection[];
  tone?: 'light' | 'dark';
  onNavigate?: () => void;
  counts?: Partial<Record<string, number>>;
}) {
  const id = useId();
  return (
    <nav aria-label={label} className={cn('grid gap-5', className)}>
      {sections.map((section, index) => (
        <div
          key={section.heading}
          role="group"
          aria-labelledby={`${id}-${index}`}
        >
          <p
            id={`${id}-${index}`}
            className={cn(
              'px-3 text-xs font-bold tracking-wide uppercase',
              tone === 'dark' ? 'text-white' : 'text-base-dark',
            )}
          >
            {section.heading}
          </p>
          <div className="mt-2">
            <NavList
              items={section.items}
              tone={tone}
              onNavigate={onNavigate}
              counts={counts}
            />
            {section.extra}
          </div>
        </div>
      ))}
    </nav>
  );
}

/**
 * The rail's logo: fixed at the top while only the links below it scroll (their scroll bar
 * starts under it), and exactly as tall as the header beside it (`--header-h`), so their lower
 * edges line up.
 */
export function RailBrand({
  to,
  label,
  tone = 'light',
  onNavigate,
}: {
  to: ComponentProps<typeof Link>['to'];
  label: string;
  tone?: 'light' | 'dark';
  onNavigate?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-(--header-h) shrink-0 items-center border-b px-4',
        tone === 'dark' ? 'border-white/25 bg-primary' : 'bg-white',
      )}
    >
      <Link
        to={to}
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        aria-label={label}
      >
        <Brand tone={tone} />
      </Link>
    </div>
  );
}

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

/** Vertical navigation list; the router marks the active link with aria-current="page". */
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
