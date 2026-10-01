import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { institutionQuery } from '@/features/directory/queries';
import { assignmentHistoryQuery } from '@/features/simulation/queries';
import { formatDateTime } from '@/lib/dates';
import {
  suggestReassignment,
  suggestionsQuery,
  supervisionQuery,
} from './queries';

/**
 * An officer's own conflict of interest with an institution. The administrator reassigns; until
 * then the officer keeps access, and the supervisor is told.
 */
function DeclareConflict({ institutionId }: { institutionId: string }) {
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      suggestReassignment({
        kind: 'conflict_of_interest',
        institutionId,
        suggestedOfficerId: null,
        reason,
      }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason('');
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Declare a conflict of interest
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Declare a conflict of interest with {institutionId}
          </DialogTitle>
          <DialogDescription>
            The administrator reassigns the institution and your supervisor is
            told. Until then it stays in your portfolio; avoid deciding on it if
            you can.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-reason`}>What is the conflict?</Label>
          <Textarea
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-describedby={`${id}-hint`}
          />
          <p id={`${id}-hint`} className="text-xs text-base-dark">
            For example, a family member works there. At least 10 characters;
            the administrator and your supervisor read it.
          </p>
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-error-dark">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="plain" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={reason.trim().length < 10 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Send declaration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Who reviews, who reviewed before, who supervises, and any cover or handover note. */
export function OfficerAssignment({
  institutionId,
}: {
  institutionId: string;
}) {
  const history = useQuery(assignmentHistoryQuery);
  const supervision = useQuery(supervisionQuery);
  const requests = useQuery(suggestionsQuery);
  const institution = useQuery(institutionQuery(institutionId));
  const records = (history.data ?? [])
    .filter((row) => row.institutionId === institutionId)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const current = records.find((row) => row.validTo === null);
  const previous = records.filter((row) => row.validTo !== null).at(-1);
  const supervisor = supervision.data?.find(
    (row) => row.institutionId === institutionId && row.validTo === null,
  );
  const pending = requests.data?.find(
    (request) =>
      request.institutionId === institutionId && request.status === 'open',
  );
  if (!current) return null;
  return (
    <section
      aria-labelledby="assignment-heading"
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="assignment-heading" className="font-bold">
          Your assignment
        </h2>
        {pending ? (
          <p className="text-sm text-base-dark">
            Conflict of interest declared {formatDateTime(pending.at)}; waiting
            for the administrator.
          </p>
        ) : (
          <DeclareConflict institutionId={institutionId} />
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm tablet:grid-cols-[12rem_1fr]">
        <div className="contents">
          <dt className="text-base-dark">Assigned to you</dt>
          <dd className="font-bold">
            Since {formatDateTime(current.validFrom)}
            {current.reason ? ` · ${current.reason}` : ''}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-base-dark">Previous officer</dt>
          <dd className="font-bold">
            {previous
              ? `${previous.officerName}, until ${formatDateTime(previous.validTo!)}`
              : 'None: you are the first'}
          </dd>
        </div>
        <div className="contents">
          <dt className="text-base-dark">Supervisor</dt>
          <dd className="font-bold">
            {supervisor?.supervisorName ?? 'None assigned'}
          </dd>
        </div>
      </dl>
      {institution.data?.activeFocalPersons === 0 && (
        <Alert variant="destructive">
          <AlertTitle>No active focal person</AlertTitle>
          <AlertDescription>
            Nobody can report for {institutionId} or receive its clarifications.
            The administrator needs to set someone up.
          </AlertDescription>
        </Alert>
      )}
      {current.cover && (
        <Alert>
          <AlertTitle>
            You are covering for {current.cover.returnToOfficerName}
          </AlertTitle>
          <AlertDescription>
            The institution returns to them automatically after{' '}
            {formatDateTime(current.cover.until)}. Decisions you record keep
            your name.
          </AlertDescription>
        </Alert>
      )}
      {current.handoverNote && (
        <div className="rounded-md bg-base-lightest p-3 text-sm">
          <p className="font-bold">Handover note</p>
          <p className="whitespace-pre-line">{current.handoverNote}</p>
        </div>
      )}
    </section>
  );
}
