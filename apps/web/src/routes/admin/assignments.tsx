import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { institutionsQuery } from '@/features/directory/queries';
import {
  assignmentHistoryQuery,
  reassign,
} from '@/features/simulation/queries';
import { formatDateTime } from '@/lib/dates';

const officers = [
  { id: 'officer-a', name: 'Prevention Officer A' },
  { id: 'officer-b', name: 'Prevention Officer B' },
];

export function AssignmentsPage() {
  const queryClient = useQueryClient();
  const history = useQuery(assignmentHistoryQuery);
  const institutions = useQuery(institutionsQuery);
  const [institutionId, setInstitutionId] = useState('DEMO-001');
  const [officerId, setOfficerId] = useState('officer-b');
  const [reason, setReason] = useState('');
  const currentOfficerId = history.data?.find(
    (row) => row.institutionId === institutionId && row.validTo === null,
  )?.officerId;
  // Never offer the institution's current officer as the new one.
  const newOfficerId =
    officerId === currentOfficerId
      ? (officers.find((officer) => officer.id !== currentOfficerId)?.id ??
        officerId)
      : officerId;
  const reasonTooShort = reason.trim().length < 10;
  const mutation = useMutation({
    mutationFn: () => reassign(institutionId, newOfficerId, reason),
    onSuccess: async () => {
      setReason('');
      await queryClient.invalidateQueries();
    },
  });
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Officer assignments"
        description="Reassignment takes effect for access immediately. Earlier reviewers stay in the history and in their recorded decisions."
      />
      <section
        aria-labelledby="reassign-heading"
        className="grid max-w-2xl grid-cols-1 gap-3 rounded-lg border bg-card p-5"
      >
        <h2 id="reassign-heading" className="font-semibold">
          Reassign an institution
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="assign-institution">Institution</Label>
            <select
              id="assign-institution"
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
              value={institutionId}
              onChange={(event) => setInstitutionId(event.target.value)}
            >
              {institutions.data?.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.id} {institution.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="assign-officer">New officer</Label>
            <select
              id="assign-officer"
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
              value={newOfficerId}
              onChange={(event) => setOfficerId(event.target.value)}
            >
              {officers.map((officer) => (
                <option
                  key={officer.id}
                  value={officer.id}
                  disabled={officer.id === currentOfficerId}
                >
                  {officer.name}
                  {officer.id === currentOfficerId ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Label htmlFor="assign-reason">Reason</Label>
        <Textarea
          id="assign-reason"
          value={reason}
          aria-describedby="assign-reason-hint"
          onChange={(event) => setReason(event.target.value)}
        />
        <p id="assign-reason-hint" className="text-sm text-muted-foreground">
          At least 10 characters. The reason is kept in the assignment history.
        </p>
        {mutation.isError && (
          <p className="text-sm text-destructive">{mutation.error.message}</p>
        )}
        <div>
          <Button
            disabled={reasonTooShort || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Reassign
          </Button>
        </div>
      </section>
      <QueryView query={history} label="assignment history">
        {(list) => (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table className="min-w-[44rem]">
              <TableCaption className="sr-only">
                Assignment history
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Institution</TableHead>
                  <TableHead scope="col">Officer</TableHead>
                  <TableHead scope="col">From</TableHead>
                  <TableHead scope="col">To</TableHead>
                  <TableHead scope="col">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...list]
                  .sort(
                    (a, b) =>
                      a.institutionId.localeCompare(b.institutionId) ||
                      a.validFrom.localeCompare(b.validFrom),
                  )
                  .map((row) => (
                    <TableRow key={`${row.institutionId}-${row.validFrom}`}>
                      <TableHead scope="row">{row.institutionId}</TableHead>
                      <TableCell>{row.officerName}</TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(row.validFrom)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.validTo ? formatDateTime(row.validTo) : 'Current'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        {row.reason ?? 'Initial assignment'}
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
