import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
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
    <div className="grid w-full max-w-md gap-1.5 sm:w-96">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
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
      <p className="text-xs text-muted-foreground" aria-live="polite">
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
  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <p className="text-muted-foreground">
        {first}–{last} of {controls.filtered.length} {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={controls.page === 0}
          onClick={() => controls.setPage(controls.page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {controls.page + 1} of {controls.pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={controls.page >= controls.pages - 1}
          onClick={() => controls.setPage(controls.page + 1)}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
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
