import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Filtering and paging for lists that grow with the number of institutions (500+ in
 * production). Filtering matches every typed word against the text each item provides.
 */
export function useListControls<T>(
  items: T[],
  text: (item: T) => string,
  pageSize = 25,
) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length
      ? items.filter((item) => {
          const haystack = text(item).toLowerCase();
          return terms.every((term) => haystack.includes(term));
        })
      : items;
  }, [items, query, text]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  return {
    query,
    setQuery: (next: string) => {
      setQuery(next);
      setPage(0);
    },
    page: current,
    pages,
    setPage,
    total: items.length,
    filtered,
    visible: filtered.slice(current * pageSize, (current + 1) * pageSize),
    pageSize,
  };
}

type Controls = ReturnType<typeof useListControls<unknown>>;

export function ListSearch({
  controls,
  label,
  placeholder,
}: {
  controls: Pick<Controls, 'query' | 'setQuery' | 'filtered' | 'total'>;
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="grid w-full max-w-mobile-lg gap-2 tablet:w-96">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-base-dark"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          className="pl-8"
          value={controls.query}
          placeholder={placeholder}
          onChange={(event) => controls.setQuery(event.target.value)}
        />
      </div>
      <p className="text-xs text-base-dark" aria-live="polite">
        {controls.query
          ? `${controls.filtered.length} of ${controls.total} shown`
          : `${controls.total} in total`}
      </p>
    </div>
  );
}

export function ListPager({
  controls,
  noun,
}: {
  controls: Pick<
    Controls,
    'page' | 'pages' | 'setPage' | 'filtered' | 'pageSize'
  >;
  noun: string;
}) {
  if (controls.pages <= 1) return null;
  const first = controls.page * controls.pageSize + 1;
  const last = Math.min(
    controls.filtered.length,
    (controls.page + 1) * controls.pageSize,
  );
  const go = (page: number) => controls.setPage(page);
  const step =
    'inline-flex min-h-touch items-center gap-1 px-2 text-primary underline underline-offset-2 hover:text-primary-dark';
  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-wrap items-center justify-between gap-4 text-sm"
    >
      <p className="text-base-dark">
        {first}–{last} of {controls.filtered.length} {noun}
      </p>
      {/* USWDS pagination: previous, numbered pages with gaps, next; the current page is filled. */}
      <ul className="flex flex-wrap items-center gap-1">
        {controls.page > 0 && (
          <li>
            <button
              type="button"
              className={step}
              onClick={() => go(controls.page - 1)}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              Previous<span className="sr-only"> page</span>
            </button>
          </li>
        )}
        {pageSlots(controls.page, controls.pages).map((slot, index) =>
          slot === null ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-2 text-base-dark"
            >
              …
            </li>
          ) : (
            <li key={slot}>
              <button
                type="button"
                aria-label={`Page ${slot + 1}`}
                aria-current={slot === controls.page ? 'page' : undefined}
                className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border border-base-dark px-2 text-ink hover:border-primary hover:text-primary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:font-bold aria-[current=page]:text-white"
                onClick={() => go(slot)}
              >
                {slot + 1}
              </button>
            </li>
          ),
        )}
        {controls.page < controls.pages - 1 && (
          <li>
            <button
              type="button"
              className={step}
              onClick={() => go(controls.page + 1)}
            >
              Next<span className="sr-only"> page</span>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** First, last, and the current page with its neighbours; null marks a gap. */
export function pageSlots(page: number, pages: number): (number | null)[] {
  const keep = [...new Set([0, page - 1, page, page + 1, pages - 1])]
    .filter((slot) => slot >= 0 && slot < pages)
    .sort((a, b) => a - b);
  return keep.flatMap((slot, index) =>
    index > 0 && slot - keep[index - 1]! > 1 ? [null, slot] : [slot],
  );
}

/** True while the browser prints, so a paged screen view can print every item. */
export function usePrinting() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}
