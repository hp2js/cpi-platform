import type { assignmentHistorySchema } from '@cpi/contracts';
import type { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/combobox';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
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
import { peopleQuery } from '@/features/settings/queries';
import { formatDateTime } from '@/lib/dates';

type HistoryRow = z.infer<typeof assignmentHistorySchema>[number];

function History({ list }: { list: HistoryRow[] }) {
  const sorted = useMemo(
    () =>
      [...list].sort(
        (a, b) =>
          a.institutionId.localeCompare(b.institutionId) ||
          a.validFrom.localeCompare(b.validFrom),
      ),
    [list],
  );
  const controls = useListControls(
    sorted,
    (row) => `${row.institutionId} ${row.officerName} ${row.reason ?? ''}`,
    50,
  );
  return (
    <section aria-labelledby="history-heading" className="grid gap-3">
      <h2 id="history-heading" className="font-semibold">
        Assignment history
      </h2>
      <ListSearch
        controls={controls}
        label="Filter the history"
        placeholder="Institution ID, officer or reason"
      />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[44rem]">
          <TableCaption className="sr-only">Assignment history</TableCaption>
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
            {controls.visible.map((row) => (
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
      <ListPager controls={controls} noun="assignments" />
    </section>
  );
}

export function AssignmentsPage() {
  const queryClient = useQueryClient();
  const history = useQuery(assignmentHistoryQuery);
  const institutions = useQuery(institutionsQuery);
  const people = useQuery(peopleQuery);
  // Active officers only; a deactivated account cannot take on institutions.
  const officers = (people.data?.users ?? [])
    .filter((user) => user.role === 'officer' && user.active)
    .map((user) => ({ id: user.id, name: user.displayName }));
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
            <Combobox
              id="assign-institution"
              searchPlaceholder="Search institutions"
              value={institutionId}
              onChange={setInstitutionId}
              options={(institutions.data ?? []).map((institution) => ({
                value: institution.id,
                label: institution.id,
                description: institution.name,
              }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="assign-officer">New officer</Label>
            <Combobox
              id="assign-officer"
              searchPlaceholder="Search officers"
              value={newOfficerId}
              onChange={setOfficerId}
              options={officers.map((officer) => ({
                value: officer.id,
                label:
                  officer.id === currentOfficerId
                    ? `${officer.name} (current)`
                    : officer.name,
                disabled: officer.id === currentOfficerId,
              }))}
            />
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
        {(list) => <History list={list} />}
      </QueryView>
    </div>
  );
}
