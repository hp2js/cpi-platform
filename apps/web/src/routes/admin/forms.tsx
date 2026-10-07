import type { FormVersion } from '@cpi/contracts';
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
  formCreationQuery,
  formsQuery,
  invalidateForms,
} from '@/features/forms/queries';
import { formatDateTime } from '@/lib/dates';
import { ChangeList } from '@/features/forms/change-list';

/** "3 changes": questions and sections added, changed or removed. */
function changeCount(form: FormVersion) {
  const count = form.changes.filter(
    (change) => change.kind !== 'periods',
  ).length;
  return count === 0
    ? 'No question changes'
    : `${count} ${count === 1 ? 'change' : 'changes'}`;
}

export function FormsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const forms = useQuery(formsQuery);
  const cycle = useQuery(cycleQuery);
  // The server says whether a version can be started, and why not (FR03).
  const creation = useQuery(formCreationQuery);
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
  const refusal =
    creation.data?.allowed === false ? creation.data.reason : null;
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
            disabled={!creation.data?.allowed || create.isPending}
            aria-describedby={refusal ? 'new-version-hint' : undefined}
          >
            <Plus aria-hidden="true" />
            New version
          </Button>
        }
      />
      {refusal && (
        <p id="new-version-hint" className="text-sm text-base-dark">
          {refusal}
        </p>
      )}
      {creation.data?.allowed && (
        <p className="text-sm text-base-dark">
          A new version can be used from{' '}
          {creation.data.assignablePeriods
            .map((period) => period.label)
            .join(', ')}
          .
        </p>
      )}
      {create.isError && (
        <Alert variant="destructive">
          <AlertDescription>{create.error.message}</AlertDescription>
        </Alert>
      )}
      <QueryView query={forms} label="forms">
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-white">
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
                  <TableHead scope="col">Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((form) => (
                  <TableRow key={form.id}>
                    <TableHead scope="row">
                      <Link
                        to="/admin/forms/$formId"
                        params={{ formId: form.id }}
                        className="font-bold text-primary underline-offset-4 hover:underline"
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
                    <TableCell className="min-w-64 text-sm whitespace-normal">
                      {form.basedOnVersion ? (
                        <details>
                          <summary className="cursor-pointer">
                            {changeCount(form)} from version{' '}
                            {form.basedOnVersion}
                          </summary>
                          <div className="mt-2">
                            <ChangeList changes={form.changes} />
                          </div>
                        </details>
                      ) : (
                        'First version'
                      )}
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
