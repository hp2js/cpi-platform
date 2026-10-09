import { elevatedAuditActions } from '@cpi/contracts';
import { useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Combobox } from '@/components/combobox';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { SelectField } from '@/components/select-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { downloadExport } from '@/features/annual/queries';
import {
  auditQuery,
  auditSearch,
  type AuditFilters,
} from '@/features/events/queries';
import {
  auditActionLabel,
  auditObjectLabel,
} from '@/features/events/audit-labels';
import { roleLabel } from '@/features/session/queries';
import { formatDateTime } from '@/lib/dates';

const objectTypes = [
  'form',
  'submission',
  'decision',
  'clarification',
  'evidence',
  'baseline',
  'amendment',
  'foundation',
  'obligation',
  'assignment',
  'supervision',
  'user',
  'institution',
  'publication',
  'simulation',
  'delivery',
];

const elevated = new Set<string>(elevatedAuditActions);

/** Waits until typing pauses before searching, so every keystroke is not a request. */
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function AuditPage() {
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<Omit<AuditFilters, 'q' | 'page'>>({});
  const [page, setPage] = useState(1);
  const q = useDebounced(text.trim());
  const query = { ...filters, q: q || undefined };
  const events = useQuery(auditQuery({ ...query, page }));
  const set = (patch: Partial<AuditFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  useEffect(() => setPage(1), [q]);
  const data = events.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Audit log"
        description="Every configuration, submission, review, assignment, publication and elevated action, with actor, object version and time. Entries cannot be edited or deleted."
        actions={
          <Button
            variant="plain"
            onClick={() =>
              void downloadExport(
                `/api/audit.csv${auditSearch(query)}`,
                'cpi-audit-log.csv',
              )
            }
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        }
      />
      <form
        role="search"
        aria-label="Filter the audit log"
        data-columns
        className="grid gap-4 rounded-lg border bg-white p-4 tablet:grid-cols-2 widescreen:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="grid gap-2 tablet:col-span-2 widescreen:col-span-3">
          <Label htmlFor="audit-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-base-dark"
              aria-hidden="true"
            />
            <Input
              id="audit-search"
              type="search"
              placeholder="Summary, object ID, person or action"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-action">Action</Label>
          <Combobox
            id="audit-action"
            allOption="All actions"
            searchPlaceholder="Search actions"
            value={filters.action ?? ''}
            onChange={(value) => set({ action: value || undefined })}
            options={(data?.actions ?? [])
              .map((action) => ({
                value: action,
                label: auditActionLabel(action),
                description: action,
              }))
              .sort((a, b) => a.label.localeCompare(b.label))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-actor">Person</Label>
          <Combobox
            id="audit-actor"
            allOption="Everyone"
            searchPlaceholder="Search people"
            value={filters.actor ?? ''}
            onChange={(value) => set({ actor: value || undefined })}
            options={(data?.actors ?? []).map((actor) => ({
              value: actor,
              label: actor,
            }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-type">Object type</Label>
          <SelectField
            id="audit-type"
            value={filters.objectType ?? ''}
            onChange={(value) => set({ objectType: value || undefined })}
            options={[
              { value: '', label: 'All object types' },
              ...objectTypes.map((type) => ({
                value: type,
                label: auditObjectLabel(type),
              })),
            ]}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-from">From (business date)</Label>
          <Input
            id="audit-from"
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => set({ from: event.target.value || undefined })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-to">To (business date)</Label>
          <Input
            id="audit-to"
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => set({ to: event.target.value || undefined })}
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Checkbox
            id="audit-elevated"
            checked={filters.elevated ?? false}
            onCheckedChange={(value) =>
              set({ elevated: value === true || undefined })
            }
          />
          <Label htmlFor="audit-elevated" className="font-normal">
            Elevated actions only (overrides, support access, files opened,
            clock, publication)
          </Label>
        </div>
      </form>
      <QueryView
        query={events}
        label="audit events"
        isEmpty={(page) => page.total === 0}
        empty="No events match these filters."
      >
        {(result) => (
          // One column capped at the page width: the wide table scrolls inside its container.
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <p role="status" className="text-sm text-base-dark">
              {result.total} {result.total === 1 ? 'event' : 'events'}, newest
              first
            </p>
            {/* Phones: one card per event, so the summary is never squeezed. */}
            <ol className="grid gap-3 tablet:hidden">
              {result.events.map((event) => (
                <li
                  key={event.id}
                  className="grid gap-1 rounded-lg border bg-white p-4 text-sm"
                >
                  <p className="font-bold">
                    {auditActionLabel(event.action)}
                    {elevated.has(event.action) && (
                      <Badge variant="secondary" className="ml-2">
                        Elevated
                      </Badge>
                    )}
                  </p>
                  <p className="font-mono text-xs text-base-dark">
                    {event.action}
                  </p>
                  <p>{event.summary}</p>
                  <p className="text-base-dark">
                    {event.actorName} ({roleLabel[event.actorRole]}) ·{' '}
                    {auditObjectLabel(event.objectType)} {event.objectId}
                    {event.objectVersion && `, version ${event.objectVersion}`}
                  </p>
                  <p className="text-xs text-base-dark">
                    Business time {formatDateTime(event.businessTime)} · Actual
                    time {formatDateTime(event.actualTime)}
                  </p>
                </li>
              ))}
            </ol>
            <div className="hidden min-w-0 overflow-x-auto rounded-lg border bg-white tablet:block">
              <Table className="min-w-[56rem] table-fixed">
                <TableCaption className="sr-only">
                  Audit events, newest first
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="w-36">
                      Business time
                    </TableHead>
                    <TableHead scope="col" className="w-36">
                      Actor
                    </TableHead>
                    <TableHead scope="col" className="w-48">
                      Action
                    </TableHead>
                    <TableHead scope="col" className="w-36">
                      Object
                    </TableHead>
                    <TableHead scope="col">Summary</TableHead>
                    <TableHead scope="col" className="w-36">
                      Actual time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm whitespace-normal">
                        {formatDateTime(event.businessTime)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {event.actorName}
                        <span className="block text-xs text-base-dark">
                          {roleLabel[event.actorRole]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {auditActionLabel(event.action)}
                        <span className="block font-mono text-xs break-all text-base-dark">
                          {event.action}
                        </span>
                        {elevated.has(event.action) && (
                          <Badge
                            variant="secondary"
                            className="mt-1 block w-fit"
                          >
                            Elevated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm break-words whitespace-normal">
                        {auditObjectLabel(event.objectType)} {event.objectId}
                        {event.objectVersion && (
                          <span className="block text-xs text-base-dark">
                            version {event.objectVersion}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {event.summary}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {formatDateTime(event.actualTime)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <nav
              aria-label="Audit log pages"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-sm text-base-dark">
                Page {result.page} of {pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="plain"
                  size="sm"
                  disabled={result.page <= 1}
                  onClick={() => setPage(result.page - 1)}
                >
                  Newer
                </Button>
                <Button
                  variant="plain"
                  size="sm"
                  disabled={result.page >= pages}
                  onClick={() => setPage(result.page + 1)}
                >
                  Older
                </Button>
              </div>
            </nav>
          </div>
        )}
      </QueryView>
    </div>
  );
}
