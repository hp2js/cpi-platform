import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { SelectField } from '@/components/select-field';
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
import { assignmentsQuery } from '@/features/directory/queries';
import { isApiError } from '@/lib/api';
import { suggestReassignment } from './queries';

/**
 * A supervisor suggests moving an institution to another officer. The administrator decides;
 * nothing changes until they apply it (PRD §5.2: supervisors read assignments).
 */
export function SuggestReassignment({
  institutionId,
  currentOfficerId,
  disabledReason,
}: {
  institutionId: string;
  currentOfficerId: string | null;
  /** Shown instead of the button, e.g. when a suggestion is already waiting. */
  disabledReason?: string;
}) {
  const queryClient = useQueryClient();
  const id = useId();
  const assignments = useQuery(assignmentsQuery);
  const [open, setOpen] = useState(false);
  const [officerId, setOfficerId] = useState('');
  const [reason, setReason] = useState('');
  // Officers the supervisor can see: those reviewing their institutions.
  const officers = [
    ...new Map(
      (assignments.data ?? [])
        .filter(
          (assignment) =>
            !assignment.validTo && assignment.officerId !== currentOfficerId,
        )
        .map((assignment) => [assignment.officerId, assignment.officerName]),
    ),
  ];
  const mutation = useMutation({
    mutationFn: () =>
      suggestReassignment({
        institutionId,
        suggestedOfficerId: officerId || null,
        reason,
      }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries();
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  if (disabledReason)
    return <span className="text-xs text-base-dark">{disabledReason}</span>;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setOfficerId('');
          setReason('');
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Suggest a reassignment
          <span className="sr-only"> for {institutionId}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest a reassignment for {institutionId}</DialogTitle>
          <DialogDescription>
            The administrator decides. The current officer keeps the institution
            until they apply it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-officer`}>Suggested officer</Label>
            <SelectField
              id={`${id}-officer`}
              value={officerId}
              onChange={setOfficerId}
              options={[
                { value: '', label: 'Let the administrator choose' },
                ...officers.map(([value, label]) => ({ value, label })),
              ]}
              invalid={Boolean(errors.suggestedOfficerId)}
            />
            {errors.suggestedOfficerId && (
              <p className="text-sm text-error-dark">
                {errors.suggestedOfficerId}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby={`${id}-reason-hint`}
            />
            <p id={`${id}-reason-hint`} className="text-xs text-base-dark">
              For example, workload balance or a conflict of interest. At least
              10 characters.
            </p>
          </div>
        </div>
        {mutation.isError && Object.keys(errors).length === 0 && (
          <p role="alert" className="text-sm text-error-dark">
            {mutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={reason.trim().length < 10 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Send to the administrator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
