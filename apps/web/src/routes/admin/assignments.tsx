import type { ReassignmentSuggestion } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/combobox';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { institutionsQuery } from '@/features/directory/queries';
import {
  assignmentHistoryQuery,
  reassign,
} from '@/features/simulation/queries';
import { peopleQuery } from '@/features/settings/queries';
import {
  changeSupervisor,
  dismissSuggestion,
  suggestionsQuery,
  supervisionQuery,
} from '@/features/supervision/queries';
import { AssignmentHistory } from '@/features/supervision/assignment-history';
import { formatDateTime } from '@/lib/dates';

function DismissSuggestion({
  suggestion,
}: {
  suggestion: ReassignmentSuggestion;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => dismissSuggestion(suggestion.id, note),
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
          setNote('');
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Keep the current officer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Keep {suggestion.currentOfficerName ?? 'the current officer'} on{' '}
            {suggestion.institutionId}?
          </DialogTitle>
          <DialogDescription>
            {suggestion.suggestedBy} is told your reason.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`dismiss-${suggestion.id}`}>Reason</Label>
          <Textarea
            id={`dismiss-${suggestion.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={note.trim().length < 10 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Keep current officer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Suggestions({
  list,
  onApply,
}: {
  list: ReassignmentSuggestion[];
  onApply: (suggestion: ReassignmentSuggestion) => void;
}) {
  const open = list.filter((suggestion) => suggestion.status === 'open');
  if (!open.length) return null;
  return (
    <section
      aria-labelledby="suggestions-heading"
      className="grid gap-3 rounded-lg border border-primary/30 bg-card p-5"
    >
      <h2 id="suggestions-heading" className="font-semibold">
        Suggestions from supervisors ({open.length})
      </h2>
      <p className="text-sm text-muted-foreground">
        Supervisors can suggest a reassignment; only you can make it.
      </p>
      <ul className="grid gap-3">
        {open.map((suggestion) => (
          <li
            key={suggestion.id}
            className="grid gap-2 rounded-md border p-3 text-sm"
          >
            <p className="font-medium">
              {suggestion.institutionId} {suggestion.institutionName}:{' '}
              {suggestion.currentOfficerName ?? 'no officer'} →{' '}
              {suggestion.suggestedOfficerName ?? 'an officer you choose'}
            </p>
            <p>{suggestion.reason}</p>
            <p className="text-xs text-muted-foreground">
              {suggestion.suggestedBy}, {formatDateTime(suggestion.at)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onApply(suggestion)}>
                Apply
                <span className="sr-only">
                  {' '}
                  the suggestion for {suggestion.institutionId}
                </span>
              </Button>
              <DismissSuggestion suggestion={suggestion} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangeSupervisor() {
  const queryClient = useQueryClient();
  const institutions = useQuery(institutionsQuery);
  const people = useQuery(peopleQuery);
  const records = useQuery(supervisionQuery);
  const supervisors = (people.data?.users ?? []).filter(
    (user) => user.role === 'supervisor' && user.active,
  );
  const [institutionId, setInstitutionId] = useState('DEMO-001');
  const [supervisorId, setSupervisorId] = useState('');
  const [reason, setReason] = useState('');
  const current = records.data?.find(
    (row) => row.institutionId === institutionId && row.validTo === null,
  );
  const mutation = useMutation({
    mutationFn: () => changeSupervisor(institutionId, supervisorId, reason),
    onSuccess: async () => {
      setReason('');
      setSupervisorId('');
      await queryClient.invalidateQueries();
    },
  });
  return (
    <section
      aria-labelledby="supervise-heading"
      className="grid grid-cols-1 content-start gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="supervise-heading" className="font-semibold">
        Change a supervisor
      </h2>
      <p className="text-sm text-muted-foreground">
        A supervisor sees only the institutions assigned to them, and the
        officers who review those institutions.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="supervise-institution">Institution</Label>
          <Combobox
            id="supervise-institution"
            searchPlaceholder="Search institutions"
            value={institutionId}
            onChange={setInstitutionId}
            options={(institutions.data ?? []).map((institution) => ({
              value: institution.id,
              label: institution.id,
              description: institution.name,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            Now: {current?.supervisorName ?? 'no supervisor'}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="supervise-supervisor">New supervisor</Label>
          <Combobox
            id="supervise-supervisor"
            placeholder="Choose a supervisor"
            searchPlaceholder="Search supervisors"
            value={supervisorId}
            onChange={setSupervisorId}
            options={supervisors.map((supervisor) => ({
              value: supervisor.id,
              label:
                supervisor.id === current?.supervisorId
                  ? `${supervisor.displayName} (current)`
                  : supervisor.displayName,
              description: `${supervisor.assignedInstitutionIds.length} institutions`,
              disabled: supervisor.id === current?.supervisorId,
            }))}
          />
        </div>
      </div>
      <Label htmlFor="supervise-reason">Reason</Label>
      <Textarea
        id="supervise-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      {mutation.isSuccess && (
        <p role="status" className="text-sm font-medium">
          The supervisor is changed; access followed at once.
        </p>
      )}
      <div>
        <Button
          disabled={
            !supervisorId || reason.trim().length < 10 || mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          Change supervisor
        </Button>
      </div>
    </section>
  );
}

export function AssignmentsPage() {
  const queryClient = useQueryClient();
  const history = useQuery(assignmentHistoryQuery);
  const supervision = useQuery(supervisionQuery);
  const suggestions = useQuery(suggestionsQuery);
  const institutions = useQuery(institutionsQuery);
  const people = useQuery(peopleQuery);
  // Active officers only; a deactivated account cannot take on institutions.
  const officers = (people.data?.users ?? [])
    .filter((user) => user.role === 'officer' && user.active)
    .map((user) => ({ id: user.id, name: user.displayName }));
  const [institutionId, setInstitutionId] = useState('DEMO-001');
  const [officerId, setOfficerId] = useState('officer-b');
  const [reason, setReason] = useState('');
  const [suggestionId, setSuggestionId] = useState<string | undefined>();
  const formRef = useRef<HTMLElement>(null);
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
    mutationFn: () =>
      reassign(institutionId, newOfficerId, reason, suggestionId),
    onSuccess: async () => {
      setReason('');
      setSuggestionId(undefined);
      await queryClient.invalidateQueries();
    },
  });
  const applying = suggestions.data?.find(
    (suggestion) => suggestion.id === suggestionId,
  );
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        eyebrow="Setup"
        title="Assignments"
        description="Officers review the institutions assigned to them; supervisors oversee theirs. Changes take effect for access immediately, and earlier assignments stay in the history."
      />
      {suggestions.data && (
        <Suggestions
          list={suggestions.data}
          onApply={(suggestion) => {
            setInstitutionId(suggestion.institutionId);
            if (suggestion.suggestedOfficerId)
              setOfficerId(suggestion.suggestedOfficerId);
            setReason(suggestion.reason);
            setSuggestionId(suggestion.id);
            mutation.reset();
            formRef.current?.scrollIntoView({ block: 'start' });
            formRef.current?.querySelector<HTMLElement>('button')?.focus();
          }}
        />
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section
          ref={formRef}
          aria-labelledby="reassign-heading"
          className="grid grid-cols-1 content-start gap-3 rounded-lg border bg-card p-5"
        >
          <h2 id="reassign-heading" className="font-semibold">
            Reassign an institution
          </h2>
          {applying && (
            <p role="status" className="rounded-md bg-muted p-2 text-sm">
              Applying {applying.suggestedBy}’s suggestion for{' '}
              {applying.institutionId}. Check the officer and reason, then
              reassign.{' '}
              <button
                type="button"
                className="text-primary underline underline-offset-4"
                onClick={() => setSuggestionId(undefined)}
              >
                Stop applying
              </button>
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="assign-institution">Institution</Label>
              <Combobox
                id="assign-institution"
                searchPlaceholder="Search institutions"
                value={institutionId}
                onChange={(next) => {
                  setInstitutionId(next);
                  setSuggestionId(undefined);
                }}
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
            At least 10 characters. The reason is kept in the assignment
            history.
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
        <ChangeSupervisor />
      </div>
      <Tabs defaultValue="officers" className="grid gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="officers">Officer history</TabsTrigger>
          <TabsTrigger value="supervisors">Supervisor history</TabsTrigger>
        </TabsList>
        <TabsContent value="officers">
          <QueryView query={history} label="assignment history">
            {(list) => (
              <AssignmentHistory
                list={list.map((row) => ({ ...row, name: row.officerName }))}
                who="Officer"
                headingId="history-heading"
                title="Officer assignment history"
              />
            )}
          </QueryView>
        </TabsContent>
        <TabsContent value="supervisors">
          <QueryView query={supervision} label="supervisor history">
            {(list) => (
              <AssignmentHistory
                list={list.map((row) => ({ ...row, name: row.supervisorName }))}
                who="Supervisor"
                headingId="supervision-heading"
                title="Supervisor history"
              />
            )}
          </QueryView>
        </TabsContent>
      </Tabs>
    </div>
  );
}
