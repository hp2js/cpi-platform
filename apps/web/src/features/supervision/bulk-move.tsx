import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Combobox } from '@/components/combobox';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { institutionsQuery } from '@/features/directory/queries';
import { peopleQuery } from '@/features/settings/queries';
import { assignmentHistoryQuery } from '@/features/simulation/queries';
import { bulkReassign, bulkSupervise, supervisionQuery } from './queries';

type Mode = 'officer' | 'supervisor';

/**
 * Moves many institutions at once, to one officer or one supervisor (500+ institutions). Each
 * institution still gets its own history entry, notifications and audit record.
 */
export function BulkMove() {
  const queryClient = useQueryClient();
  const institutions = useQuery(institutionsQuery);
  const history = useQuery(assignmentHistoryQuery);
  const supervision = useQuery(supervisionQuery);
  const people = useQuery(peopleQuery);
  const [mode, setMode] = useState<Mode>('officer');
  const [from, setFrom] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [handoverNote, setHandoverNote] = useState('');

  const holderOf = (institutionId: string) =>
    mode === 'officer'
      ? history.data?.find(
          (row) => row.institutionId === institutionId && row.validTo === null,
        )?.officerId
      : supervision.data?.find(
          (row) => row.institutionId === institutionId && row.validTo === null,
        )?.supervisorId;
  const candidates = (people.data?.users ?? []).filter(
    (user) => user.role === mode && user.active,
  );
  const nameOf = (userId: string | undefined) =>
    people.data?.users.find((user) => user.id === userId)?.displayName ??
    'Nobody';
  const needle = filter.trim().toLowerCase();
  const shown = (institutions.data ?? []).filter(
    (institution) =>
      (!from || holderOf(institution.id) === from) &&
      (!needle ||
        `${institution.id} ${institution.name}`.toLowerCase().includes(needle)),
  );
  const allShown =
    shown.length > 0 &&
    shown.every((institution) => selected.has(institution.id));

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'officer'
        ? bulkReassign({
            institutionIds: [...selected],
            officerId: target,
            reason,
            handoverNote: handoverNote.trim() || undefined,
          })
        : bulkSupervise({
            institutionIds: [...selected],
            supervisorId: target,
            reason,
          }),
    onSuccess: async () => {
      setSelected(new Set());
      setReason('');
      setHandoverNote('');
      await queryClient.invalidateQueries();
    },
  });

  const reset = (next: Mode) => {
    setMode(next);
    setFrom('');
    setTarget('');
    setSelected(new Set());
    mutation.reset();
  };

  return (
    <section
      aria-labelledby="bulk-heading"
      className="grid gap-4 rounded-lg border bg-white p-5"
    >
      <div>
        <h2 id="bulk-heading" className="font-bold">
          Move several institutions
        </h2>
        <p className="mt-1 text-sm text-base-dark">
          For example, all of one officer’s institutions when they leave. Each
          institution keeps its own history entry and everyone involved is told.
        </p>
      </div>
      <div className="grid gap-3 tablet:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="bulk-mode">Change the</Label>
          <SelectField
            id="bulk-mode"
            value={mode}
            onChange={(value) => reset(value as Mode)}
            options={[
              { value: 'officer', label: 'Reviewing officer' },
              { value: 'supervisor', label: 'Supervisor' },
            ]}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bulk-from">Currently with</Label>
          <Combobox
            id="bulk-from"
            allOption="Anyone"
            searchPlaceholder="Search people"
            value={from}
            onChange={(value) => {
              setFrom(value);
              setSelected(new Set());
            }}
            options={candidates.map((user) => ({
              value: user.id,
              label: user.displayName,
              description: `${user.assignedInstitutionIds.length} institutions`,
            }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bulk-filter">Filter institutions</Label>
          <Input
            id="bulk-filter"
            type="search"
            placeholder="ID or name"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="sr-only">Institutions to move</legend>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-all"
              checked={allShown}
              disabled={shown.length === 0}
              onCheckedChange={(value) =>
                setSelected((current) => {
                  const next = new Set(current);
                  for (const institution of shown)
                    if (value === true) next.add(institution.id);
                    else next.delete(institution.id);
                  return next;
                })
              }
            />
            <Label htmlFor="bulk-all" className="font-normal">
              Select all {shown.length} shown
            </Label>
          </div>
          <p role="status" className="text-sm text-base-dark">
            {selected.size} selected
          </p>
        </div>
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-2 tablet:grid-cols-2">
          {shown.map((institution) => (
            <li key={institution.id} className="flex items-start gap-2 p-1">
              <Checkbox
                id={`bulk-${institution.id}`}
                checked={selected.has(institution.id)}
                onCheckedChange={(value) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (value === true) next.add(institution.id);
                    else next.delete(institution.id);
                    return next;
                  })
                }
                className="mt-1"
              />
              <Label
                htmlFor={`bulk-${institution.id}`}
                className="grid gap-0 font-normal"
              >
                <span className="font-bold">
                  {institution.id} {institution.name}
                </span>
                <span className="text-xs text-base-dark">
                  Now: {nameOf(holderOf(institution.id))}
                </span>
              </Label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="p-2 text-sm text-base-dark">
              No institutions match.
            </li>
          )}
        </ul>
      </fieldset>

      <div className="grid gap-3 tablet:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="bulk-target">
            New {mode === 'officer' ? 'reviewing officer' : 'supervisor'}
          </Label>
          <Combobox
            id="bulk-target"
            placeholder={`Choose ${mode === 'officer' ? 'an officer' : 'a supervisor'}`}
            searchPlaceholder="Search people"
            value={target}
            onChange={setTarget}
            options={candidates.map((user) => ({
              value: user.id,
              label: user.displayName,
              description: `${user.assignedInstitutionIds.length} institutions`,
            }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bulk-reason">Reason</Label>
          <Textarea
            id="bulk-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>
      {mode === 'officer' && (
        <div className="grid gap-2">
          <Label htmlFor="bulk-handover">Handover note (optional)</Label>
          <Textarea
            id="bulk-handover"
            value={handoverNote}
            onChange={(event) => setHandoverNote(event.target.value)}
          />
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-error-dark">
          {mutation.error.message}
        </p>
      )}
      {mutation.data && (
        <p role="status" className="text-sm font-bold">
          Moved {mutation.data.changed.length}{' '}
          {mutation.data.changed.length === 1 ? 'institution' : 'institutions'}
          {mutation.data.unchanged.length > 0 &&
            `; ${mutation.data.unchanged.length} already had that ${mode === 'officer' ? 'officer' : 'supervisor'}`}
          .
        </p>
      )}
      <div>
        <Button
          disabled={
            selected.size === 0 ||
            !target ||
            reason.trim().length < 10 ||
            mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          Move {selected.size}{' '}
          {selected.size === 1 ? 'institution' : 'institutions'}
        </Button>
      </div>
    </section>
  );
}
