import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cycleQuery } from '@/features/directory/queries';
import {
  createFormVersion,
  formsQuery,
  invalidateForms,
} from '@/features/forms/queries';
import { formatDateTime } from '@/lib/dates';

export function FormsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const forms = useQuery(formsQuery);
  const cycle = useQuery(cycleQuery);
  const create = useMutation({
    mutationFn: createFormVersion,
    onSuccess: async (form) => {
      await invalidateForms(queryClient);
      await navigate({
        to: '/admin/forms/$formId',
        params: { formId: form.id },
      });
    },
  });
  const hasDraft = forms.data?.some((form) => form.status === 'draft');
  const hasPublished = forms.data?.some((form) => form.status === 'published');
  const periodLabel = (id: string) =>
    cycle.data?.periods.find((period) => period.id === id)?.label ?? id;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Forms & scoring"
        title="Reporting forms"
        description="Each published version is immutable. A new version applies only to periods that have not started reporting; open periods keep their version."
        actions={
          <Button
            onClick={() => create.mutate()}
            disabled={!hasPublished || hasDraft || create.isPending}
            aria-describedby={
              hasDraft || !hasPublished ? 'new-version-hint' : undefined
            }
          >
            <Plus aria-hidden="true" />
            New version
          </Button>
        }
      />
      {(hasDraft || (forms.isSuccess && !hasPublished)) && (
        <p id="new-version-hint" className="text-sm text-muted-foreground">
          {hasDraft
            ? 'A draft version is already open. Publish or edit it before starting another.'
            : 'Publish the first version before creating another.'}
        </p>
      )}
      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>{create.error.message}</AlertDescription>
        </Alert>
      )}
      <QueryView query={forms} label="forms">
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableCaption className="sr-only">
                Form versions, newest first
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Version</TableHead>
                  <TableHead scope="col">Title</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Periods</TableHead>
                  <TableHead scope="col">Published</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((form) => (
                  <TableRow key={form.id}>
                    <TableHead scope="row">
                      <Link
                        to="/admin/forms/$formId"
                        params={{ formId: form.id }}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Version {form.version}
                      </Link>
                    </TableHead>
                    <TableCell>{form.title}</TableCell>
                    <TableCell>
                      {form.status === 'draft'
                        ? 'Draft (not visible to institutions)'
                        : 'Published, locked'}
                    </TableCell>
                    <TableCell>
                      {form.periodIds.map(periodLabel).join(', ') || '—'}
                    </TableCell>
                    <TableCell>
                      {form.publishedAt
                        ? formatDateTime(form.publishedAt)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryView>
    </div>
  );
}
