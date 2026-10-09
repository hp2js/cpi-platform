import type { ClosedYearResults as ClosedResults } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryView } from '@/components/query-view';
import { PublishedResults } from '@/features/annual/published-results';
import { formatCalendarDate, formatDateTime } from '@/lib/dates';
import { closedResultsQuery, closedYearsQuery } from './queries';

/**
 * A closed year's published results within the reader's scope (HP2-100): each institution's
 * current result and its history, exactly as released, and the results never published.
 */
export function ClosedYearResults({ data }: { data: ClosedResults }) {
  const institutions = [
    ...new Map(
      data.results.map((result) => [
        result.institutionId,
        result.institutionName,
      ]),
    ),
  ].sort(([a], [b]) => a.localeCompare(b));
  // One institution in scope (the institution's own view): show it directly.
  const single = institutions.length === 1 && data.pending.length === 0;
  return (
    <div className="grid gap-4">
      {data.results.length === 0 && data.pending.length === 0 && (
        <p className="text-sm text-base-dark">
          No results were published in {data.year.label}.
        </p>
      )}
      {institutions.map(([institutionId, name]) => {
        const results = data.results.filter(
          (result) => result.institutionId === institutionId,
        );
        const current = results.find((result) => result.status === 'current');
        return single ? (
          <PublishedResults
            key={institutionId}
            results={results}
            cycleLabel={data.year.label}
          />
        ) : (
          <details
            key={institutionId}
            className="rounded-lg border bg-white p-4"
          >
            <summary className="cursor-pointer">
              <span className="font-bold">
                {institutionId} · {name}
              </span>
              <span className="text-sm text-base-dark">
                {' '}
                ·{' '}
                {current
                  ? `${current.evaluation.total.status === 'calculated' ? `${current.evaluation.total.points} points, ` : ''}version ${current.version}`
                  : 'superseded only'}
                {results.length > 1 && ` · ${results.length} versions`}
              </span>
            </summary>
            <div className="mt-4">
              <PublishedResults
                results={results}
                cycleLabel={data.year.label}
              />
            </div>
          </details>
        );
      })}
      {data.pending.length > 0 && (
        <section className="grid gap-2 rounded-lg border bg-white p-4">
          <h3 className="font-bold">Never published</h3>
          <p className="text-sm text-base-dark">
            {data.year.label} closed without a published result for:
          </p>
          <ul className="list-disc pl-5 text-sm">
            {data.pending.map((item) => (
              <li key={item.institutionId}>
                {item.institutionId} · {item.institutionName}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ClosedYear({ yearId }: { yearId: string }) {
  const results = useQuery(closedResultsQuery(yearId));
  return (
    <QueryView query={results} label="results for that year">
      {(data) => <ClosedYearResults data={data} />}
    </QueryView>
  );
}

/**
 * Results from closed financial years, newest first; each loads when opened. Renders nothing
 * while there are none, so the active year's screens are unchanged until a year has closed.
 */
export function EarlierYears() {
  const years = useQuery(closedYearsQuery);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const closed = [...(years.data ?? [])].reverse();
  if (closed.length === 0) return null;
  return (
    <section aria-labelledby="earlier-years-heading" className="grid gap-4">
      <div>
        <h2 id="earlier-years-heading" className="text-lg font-bold">
          Earlier years
        </h2>
        <p className="text-sm text-base-dark">
          Results published in closed financial years, exactly as released.
        </p>
      </div>
      {closed.map((year) => (
        <details
          key={year.id}
          className="rounded-lg border bg-base-lightest p-4"
          onToggle={(event) => {
            const isOpen = event.currentTarget.open;
            setOpen((previous) => {
              const next = new Set(previous);
              if (isOpen) next.add(year.id);
              return next;
            });
          }}
        >
          <summary className="cursor-pointer">
            <span className="font-bold">{year.label}</span>
            <span className="text-sm text-base-dark">
              {' '}
              · {formatCalendarDate(year.startsOn)} to{' '}
              {formatCalendarDate(year.endsOn)}
              {year.closedAt && ` · closed ${formatDateTime(year.closedAt)}`}
            </span>
          </summary>
          {open.has(year.id) && (
            <div className="mt-4">
              <ClosedYear yearId={year.id} />
            </div>
          )}
        </details>
      ))}
    </section>
  );
}
