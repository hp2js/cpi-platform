import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import {
  flexRender,
  createFilteredRowModel,
  createSortedRowModel,
  useTable,
  tableFeatures,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  filterFns,
  sortFns,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Activity,
  Blocks,
  LayoutTemplate,
} from 'lucide-react';
import { foundationRoute } from '../router';
import { healthQuery } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ExampleRow {
  name: string;
  status: string;
}
const rows: ExampleRow[] = [
  { name: 'Example institution A', status: 'Draft' },
  { name: 'Example institution B', status: 'Submitted' },
  { name: 'Example institution C', status: 'In review' },
];
const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns,
  sortFns,
});
const columns: ColumnDef<typeof features, ExampleRow>[] = [
  { accessorKey: 'name', header: 'Institution' },
  { accessorKey: 'status', header: 'Example status' },
];

export function PreviewForm() {
  const [preview, setPreview] = useState('');
  const form = useForm({
    defaultValues: { name: '' },
    onSubmit: async ({ value }) => {
      setPreview(value.name.trim());
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-5"
      noValidate
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            value.trim().length < 3
              ? 'Enter at least 3 characters.'
              : undefined,
        }}
      >
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor="example-name">Institution name</Label>
            <Input
              id="example-name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby="name-help name-error"
              autoComplete="off"
            />
            <p id="name-help" className="text-sm text-muted-foreground">
              Use a fictional name. This example does not save data.
            </p>
            <p
              id="name-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {field.state.meta.errors.join(' ')}
            </p>
          </div>
        )}
      </form.Field>
      <Button type="submit">Preview entry</Button>
      <p role="status" className="text-sm">
        {preview ? `Preview: ${preview}. Nothing has been saved.` : ''}
      </p>
    </form>
  );
}

export function FoundationPage() {
  const health = useQuery(healthQuery);
  const queryClient = useQueryClient();
  const search = foundationRoute.useSearch();
  const navigate = foundationRoute.useNavigate();
  const table = useTable({
    data: rows,
    columns,
    features,
    state: {
      globalFilter: search.q,
      sorting: [{ id: search.sort, desc: search.desc }],
    },
  });
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-6 py-10 md:py-14">
      <section className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          A shared starting point
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Build clarity into
          <br className="hidden sm:block" /> corruption prevention.
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
          The workspace for our Track 2 implementation. These examples establish
          the patterns for reporting, review and institutional oversight.
        </p>
      </section>
      <Alert>
        <Blocks className="size-4" />
        <AlertTitle>Foundation preview</AlertTitle>
        <AlertDescription>
          Sample records demonstrate interface behaviour. Reporting,
          authentication and assessment workflows are not implemented here.
        </AlertDescription>
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="h-fit">
          <CardHeader>
            <Activity className="mb-2 size-5 text-primary" />
            <CardTitle>Service readiness</CardTitle>
            <CardDescription>Live checks through the API.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {health.isPending ? (
              <p role="status">Checking services…</p>
            ) : health.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Services are unavailable. Check the API, PostgreSQL and Redis,
                then retry.
              </p>
            ) : (
              <dl className="space-y-3">
                {Object.entries(health.data.services).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 text-sm">
                    <dt className="capitalize">{key}</dt>
                    <dd className="font-medium">
                      {value === 'up' ? '✓ Connected' : 'Unavailable'}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <Button
              variant="outline"
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: healthQuery.queryKey,
                })
              }
              disabled={health.isFetching}
            >
              {health.isFetching ? 'Checking…' : 'Check again'}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <CardTitle>Institution list pattern</CardTitle>
                <CardDescription>
                  Fictional records · filter and sorting stay in the URL.
                </CardDescription>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <LayoutTemplate className="size-4" />
                    Try a form
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Preview an institution</DialogTitle>
                    <DialogDescription>
                      Try validation and keyboard navigation using a fictional
                      name.
                    </DialogDescription>
                  </DialogHeader>
                  <PreviewForm />
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="filter">Filter institutions</Label>
              <Input
                id="filter"
                placeholder="Search example records…"
                value={search.q}
                onChange={(event) =>
                  void navigate({
                    search: () => ({
                      ...search,
                      q: event.target.value,
                    }),
                    replace: true,
                  })
                }
              />
            </div>
            <Table>
              <caption className="sr-only">
                Fictional institutions used to demonstrate filtering and
                sorting.
              </caption>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        aria-sort={
                          header.column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : header.column.getIsSorted() === 'desc'
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <button
                          className="inline-flex items-center gap-2 py-3 font-medium focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() =>
                            void navigate({
                              search: () => ({
                                ...search,
                                sort:
                                  header.column.id === 'status'
                                    ? 'status'
                                    : 'name',
                                desc:
                                  search.sort === header.column.id
                                    ? !search.desc
                                    : false,
                              }),
                            })
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden="true" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="size-3" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown
                              className="size-3"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-4">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No matching institutions. Try another search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
