import type { AnnualEvaluation } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryView } from '@/components/query-view';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { invalidateEvents } from '@/features/events/queries';
import { annualQuery, closeNonresponse, invalidateAnnual } from './queries';

const label = {
  finalized: 'Finalized',
  closed_without_submission: 'Closed without submission',
  awaiting_review: 'Awaiting your review',
  awaiting_institution: 'Awaiting institution response',
  not_submitted: 'Not submitted',
} as const;

function CloseForm({
  obligationId,
  periodLabel,
}: {
  obligationId: string;
  periodLabel: string;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => closeNonresponse(obligationId, reason),
    onSuccess: () =>
      Promise.all([
        invalidateAnnual(queryClient),
        invalidateEvents(queryClient),
      ]),
  });
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3">
      <Label htmlFor={`close-${obligationId}`}>
        Record non-response for {periodLabel} (implementation 0)
      </Label>
      <Textarea
        id={`close-${obligationId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={reason.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Close without submission
        </Button>
      </div>
    </div>
  );
}

/** The officer, not the scheduler, records a non-response disposition after the cutoff (§7.6). */
export function QuarterDispositions({
  institutionId,
}: {
  institutionId: string;
}) {
  const annual = useQuery(annualQuery);
  return (
    <QueryView query={annual} label="quarter dispositions">
      {(data) => {
        const evaluation: AnnualEvaluation | undefined = data.institutions.find(
          (candidate) => candidate.institutionId === institutionId,
        );
        if (!evaluation)
          return (
            <p className="text-sm text-muted-foreground">
              No evaluation is available.
            </p>
          );
        return (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Evaluation cutoff{' '}
              {data.cutoffPassed ? 'has passed' : 'has not passed yet'}. A
              quarter without a submission can be closed only after the cutoff,
              with a reason.
            </p>
            <ul className="grid gap-3">
              {evaluation.quarters.map((quarter) => (
                <li
                  key={quarter.periodId}
                  className="grid gap-2 rounded-lg border bg-card p-4 text-sm"
                >
                  <p>
                    <span className="font-semibold">{quarter.periodLabel}</span>{' '}
                    · {label[quarter.status]}
                    {quarter.implementation &&
                      ` · ${quarter.implementation.numerator} of ${quarter.implementation.denominator} milestones accepted`}
                    {quarter.late && ' · late'}
                  </p>
                  {quarter.status === 'not_submitted' && data.cutoffPassed && (
                    <CloseForm
                      obligationId={`${institutionId}:${quarter.periodId}`}
                      periodLabel={quarter.periodLabel}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </QueryView>
  );
}
