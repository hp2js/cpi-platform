import type { AnnualEvaluation } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Send } from 'lucide-react';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ListPager,
  ListSearch,
  useListControls,
} from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  annualQuery,
  downloadExport,
  invalidateAnnual,
  openCorrection,
  publishResults,
  recordExtension,
} from '@/features/annual/queries';
import { invalidateEvents } from '@/features/events/queries';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { SelectField } from '@/components/select-field';

function status(evaluation: AnnualEvaluation) {
  if (evaluation.correction)
    return `Correction open (${evaluation.correction.periodId.slice(-2)}): ${evaluation.correction.reason}`;
  if (evaluation.publication?.stale) return 'Published result is out of date';
  if (evaluation.publication)
    return `Published v${evaluation.publication.version}, ${formatDateTime(evaluation.publication.publishedAt)}`;
  if (evaluation.releasable) return 'Ready for release';
  return 'Not ready';
}

/** An authorized institution-specific evaluation extension (PRD §7.3, AT29). */
function ExtensionForm({ evaluation }: { evaluation: AnnualEvaluation }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [untilDate, setUntilDate] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      recordExtension({
        institutionId: evaluation.institutionId,
        untilDate,
        authorizedBy,
        reason,
      }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        invalidateAnnual(queryClient),
        invalidateEvents(queryClient),
      ]);
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};
  const id = `ext-${evaluation.institutionId}`;
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Record an extension
      </Button>
    );
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3">
      <p className="text-sm text-muted-foreground">
        The extension lets evidence and review finish. It never shortens a
        response window and does not change other deadlines or lateness.
      </p>
      <Label htmlFor={`${id}-until`}>Extended to</Label>
      <Input
        id={`${id}-until`}
        type="date"
        value={untilDate}
        onChange={(event) => setUntilDate(event.target.value)}
      />
      {errors.untilDate && (
        <p className="text-sm text-destructive">{errors.untilDate}</p>
      )}
      <Label htmlFor={`${id}-by`}>Authorized by</Label>
      <Input
        id={`${id}-by`}
        value={authorizedBy}
        onChange={(event) => setAuthorizedBy(event.target.value)}
      />
      <Label htmlFor={`${id}-reason`}>Reason</Label>
      <Textarea
        id={`${id}-reason`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && !errors.untilDate && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={
            !untilDate ||
            authorizedBy.trim().length < 3 ||
            reason.trim().length < 10 ||
            mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          Record extension
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CorrectionForm({ evaluation }: { evaluation: AnnualEvaluation }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [periodId, setPeriodId] = useState(evaluation.quarters[0]!.periodId);
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      openCorrection(evaluation.institutionId, periodId, reason),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        invalidateAnnual(queryClient),
        invalidateEvents(queryClient),
      ]);
    },
  });
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Open correction case
      </Button>
    );
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3">
      <Label htmlFor={`corr-period-${evaluation.institutionId}`}>
        Quarter to correct
      </Label>
      <SelectField
        id={`corr-period-${evaluation.institutionId}`}
        value={periodId}
        onChange={setPeriodId}
        options={evaluation.quarters.map((quarter) => ({
          value: quarter.periodId,
          label: quarter.periodLabel,
        }))}
      />
      <Label htmlFor={`corr-reason-${evaluation.institutionId}`}>Reason</Label>
      <Textarea
        id={`corr-reason-${evaluation.institutionId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {mutation.isError && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={reason.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Open case
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

type Evaluation = AnnualEvaluation;
const stateOf = (evaluation: Evaluation) =>
  evaluation.publication
    ? evaluation.correction
      ? 'correction'
      : 'published'
    : evaluation.releasable
      ? 'ready'
      : 'pending';

/** Filtered and paged: the full list can hold every institution in the cycle. */
function EvaluationList({
  evaluations,
  selectable,
  selected,
  setSelected,
  cutoffPassed,
}: {
  evaluations: Evaluation[];
  selectable: Evaluation[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  cutoffPassed: boolean;
}) {
  const data = { cutoffPassed };
  const [state, setState] = useState('');
  const byState = useMemo(
    () =>
      state
        ? evaluations.filter((evaluation) => stateOf(evaluation) === state)
        : evaluations,
    [evaluations, state],
  );
  const controls = useListControls(
    byState,
    (evaluation) =>
      `${evaluation.institutionId} ${evaluation.institutionName} ${evaluation.officerName}`,
    20,
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start gap-4">
        <ListSearch
          controls={controls}
          label="Find an institution"
          placeholder="ID, name or officer"
        />
        <div className="grid w-52 gap-1.5">
          <Label htmlFor="annual-state">Status</Label>
          <SelectField
            id="annual-state"
            value={state}
            onChange={setState}
            options={[
              { value: '', label: `All (${evaluations.length})` },
              ...(
                [
                  ['ready', 'Ready for release'],
                  ['pending', 'Not ready'],
                  ['published', 'Published'],
                  ['correction', 'Correction open'],
                ] as const
              ).map(([value, label]) => ({
                value,
                label: `${label} (${evaluations.filter((evaluation) => stateOf(evaluation) === value).length})`,
              })),
            ]}
          />
        </div>
      </div>
      <ul className="grid gap-3">
        {controls.visible.map((evaluation) => {
          const canSelect = selectable.includes(evaluation);
          return (
            <li
              key={evaluation.institutionId}
              className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-[auto_1fr_auto] md:items-start"
            >
              <Checkbox
                id={`publish-${evaluation.institutionId}`}
                aria-label={`Select ${evaluation.institutionId} for publication`}
                disabled={!canSelect || !data.cutoffPassed}
                checked={selected.includes(evaluation.institutionId)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked === true
                      ? [...current, evaluation.institutionId]
                      : current.filter((id) => id !== evaluation.institutionId),
                  )
                }
                className="mt-1"
              />
              <div className="grid gap-1 text-sm">
                <p className="font-semibold">
                  {evaluation.institutionId}{' '}
                  <span className="font-normal text-muted-foreground">
                    {evaluation.institutionName} · {evaluation.officerName}
                  </span>
                </p>
                <div>
                  {evaluation.total.status === 'calculated' ? (
                    <>
                      <span className="font-semibold tabular-nums">
                        {evaluation.total.points}
                      </span>{' '}
                      / 100 · {status(evaluation)}
                    </>
                  ) : (
                    <details>
                      <summary className="cursor-pointer">
                        Pending · {evaluation.total.reasons.length}{' '}
                        {evaluation.total.reasons.length === 1
                          ? 'item'
                          : 'items'}{' '}
                        outstanding
                      </summary>
                      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                        {evaluation.total.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {evaluation.quarters
                    .map(
                      (quarter) =>
                        `${quarter.periodLabel} ${quarter.implementation ? `${quarter.implementation.numerator}/${quarter.implementation.denominator}` : quarter.status.replaceAll('_', ' ')}${quarter.late ? ' (late)' : ''}`,
                    )
                    .join(' · ')}
                </p>
              </div>
              {(evaluation.holds.length > 0 || evaluation.extension) && (
                <div className="grid gap-1 text-sm">
                  {evaluation.holds.map((hold) => (
                    <p key={hold} className="font-medium">
                      {hold}
                    </p>
                  ))}
                  {evaluation.extension && (
                    <p className="text-muted-foreground">
                      Extension authorized by{' '}
                      {evaluation.extension.authorizedBy}, recorded by{' '}
                      {evaluation.extension.recordedBy}{' '}
                      {formatDateTime(evaluation.extension.recordedAt)}:{' '}
                      {evaluation.extension.reason}
                    </p>
                  )}
                </div>
              )}
              {evaluation.extensionRequired && (
                <ExtensionForm evaluation={evaluation} />
              )}
              {evaluation.publication && !evaluation.correction && (
                <CorrectionForm evaluation={evaluation} />
              )}
            </li>
          );
        })}
      </ul>
      <ListPager controls={controls} noun="institutions" />
    </div>
  );
}

export function AnnualPage() {
  const queryClient = useQueryClient();
  const annual = useQuery(annualQuery);
  const [selected, setSelected] = useState<string[]>([]);
  const publish = useMutation({
    mutationFn: () => publishResults(selected),
    onSuccess: async () => {
      setSelected([]);
      await Promise.all([
        invalidateAnnual(queryClient),
        invalidateEvents(queryClient),
      ]);
    },
  });
  const exportCsv = useMutation({
    mutationFn: () =>
      downloadExport('/api/annual/report.csv', 'cpi-consolidated-results.csv'),
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Publication"
        title="Annual evaluation and release"
        description="A result is releasable only when all four quarters have a final disposition and all three foundations are reviewed. Publication is by batch, after the evaluation cutoff."
        actions={
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate()}
            disabled={exportCsv.isPending}
          >
            <Download aria-hidden="true" />
            Consolidated CSV
          </Button>
        }
      />
      <QueryView query={annual} label="annual evaluation">
        {(data) => {
          const selectable = data.institutions.filter(
            (evaluation) =>
              evaluation.releasable &&
              (!evaluation.publication || evaluation.correction),
          );
          return (
            <div className="grid gap-4">
              <Alert>
                <AlertDescription>
                  {data.profileName}
                  {data.simulation &&
                    ' (simulation profile, not official EACC scoring)'}{' '}
                  · evaluation cutoff {formatDateTime(data.evaluationCutoff)}:{' '}
                  {data.cutoffPassed
                    ? 'passed'
                    : 'not yet passed, so publication is not available'}{' '}
                  · as of {formatDateTime(data.asOf)}
                </AlertDescription>
              </Alert>
              {publish.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{publish.error.message}</AlertDescription>
                </Alert>
              )}
              <EvaluationList
                evaluations={data.institutions}
                selectable={selectable}
                selected={selected}
                setSelected={setSelected}
                cutoffPassed={data.cutoffPassed}
              />
              <div className="flex flex-wrap items-center gap-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={selected.length === 0 || publish.isPending}
                    >
                      <Send aria-hidden="true" />
                      Publish {selected.length || ''} selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Publish {selected.length} result(s)?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Each institution will see only its own result and
                        explanation. A published result can change only through
                        a correction case, and earlier versions stay on record.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => publish.mutate()}>
                        Publish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {selectable.length > 0 && data.cutoffPassed && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        selectable.map(
                          (evaluation) => evaluation.institutionId,
                        ),
                      )
                    }
                  >
                    Select all ready ({selectable.length})
                  </Button>
                )}
              </div>
            </div>
          );
        }}
      </QueryView>
      {exportCsv.isError && (
        <p role="alert" className="text-sm text-destructive">
          {exportCsv.error.message}
        </p>
      )}
    </div>
  );
}
