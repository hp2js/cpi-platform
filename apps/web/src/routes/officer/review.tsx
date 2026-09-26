import type {
  Decision,
  EvidenceAnswer,
  EvidenceItem,
  Milestone,
  MilestoneResponse,
  ReviewBundle,
} from '@cpi/contracts';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft, CircleCheck, CircleX, FileText, Lock } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { FlagList, WorkflowStateBadge } from '@/components/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  evidenceCategoryLabel,
  formatBytes,
} from '@/features/reporting/answers';
import {
  finalizeReview,
  invalidateReviews,
  recordDecision,
  reviewKeys,
  reviewQuery,
} from '@/features/review/queries';
import { ComponentScoreValue } from '@/features/review/score-display';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/officer/reviews/$submissionId');

const basisLabel = {
  claimed_with_evidence: 'Claimed complete with a supplied file',
  claimed_evidence_unavailable:
    'Claimed complete; evidence declared unavailable',
  claimed_without_evidence: 'Claimed complete without a supplied file',
  not_claimed: 'Not claimed complete',
} as const;

function ScorePanel({ bundle }: { bundle: ReviewBundle }) {
  return (
    <section
      aria-labelledby="score-heading"
      className="rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="score-heading" className="font-semibold">
          Implementation result for {bundle.item.periodLabel}
        </h2>
        <p className="text-xs text-muted-foreground">
          {bundle.score.profileName}
          {bundle.score.simulation && ' · simulation profile'} · internal: the
          institution does not see scores before publication
        </p>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md bg-muted/60 p-4">
          <dt className="text-sm font-medium">
            Provisional (from claims and supplied files)
          </dt>
          <dd className="mt-1">
            <ComponentScoreValue score={bundle.score.provisional} />
          </dd>
        </div>
        <div className="rounded-md bg-accent p-4">
          <dt className="text-sm font-medium">
            Reviewed (from your decisions)
          </dt>
          <dd className="mt-1">
            <ComponentScoreValue score={bundle.score.reviewed} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Claim({
  response,
  basis,
}: {
  response: MilestoneResponse | undefined;
  basis: keyof typeof basisLabel | undefined;
}) {
  if (!response)
    return (
      <p className="text-sm text-muted-foreground">No response recorded.</p>
    );
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-medium">
        {response.completed ? 'Reported completed' : 'Reported not completed'}
      </p>
      {response.completed ? (
        <p>
          <span className="text-muted-foreground">Output: </span>
          {response.output || '—'}
        </p>
      ) : (
        <>
          <p>
            <span className="text-muted-foreground">Why not: </span>
            {response.emergingIssues || '—'}
          </p>
          <p>
            <span className="text-muted-foreground">Actions: </span>
            {response.actions || '—'}
          </p>
        </>
      )}
      {basis && (
        <p className="text-xs text-muted-foreground">
          Provisional basis: {basisLabel[basis]}
        </p>
      )}
    </div>
  );
}

function Evidence({
  response,
  evidence,
}: {
  response: MilestoneResponse | undefined;
  evidence: EvidenceItem[];
}) {
  if (!response?.completed)
    return (
      <p className="text-sm text-muted-foreground">No completion claimed.</p>
    );
  return (
    <div className="grid gap-2 text-sm">
      {response.evidence.map((reference) => {
        const item = evidence.find(
          (candidate) => candidate.id === reference.evidenceId,
        );
        return (
          <p key={reference.evidenceId} className="flex items-start gap-1.5">
            <FileText
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium">
                {item?.fileName ?? 'File not attached to this revision'}
              </span>
              <span className="block text-muted-foreground">
                Cited: {reference.passage || 'no passage given'}
              </span>
            </span>
          </p>
        );
      })}
      {response.evidenceUnavailable && (
        <p>
          <span className="font-medium">Declared unavailable: </span>
          {response.evidenceUnavailable.explanation}
        </p>
      )}
      {response.evidence.length === 0 && !response.evidenceUnavailable && (
        <p className="text-muted-foreground">No evidence referenced.</p>
      )}
    </div>
  );
}

function DecisionForm({
  bundle,
  milestone,
  decision,
}: {
  bundle: ReviewBundle;
  milestone: Milestone;
  decision: Decision | undefined;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (value: { outcome: 'accepted' | 'rejected'; reason: string }) =>
      recordDecision(bundle.submissionId, milestone.code, {
        ...value,
        revision: bundle.item.revision,
      }),
    onSuccess: async (next) => {
      queryClient.setQueryData(reviewKeys.detail(bundle.submissionId), next);
      await invalidateReviews(queryClient);
    },
  });
  const form = useForm({
    defaultValues: {
      outcome: decision?.outcome ?? '',
      reason: decision?.reason ?? '',
    } as { outcome: 'accepted' | 'rejected' | ''; reason: string },
    onSubmit: ({ value }) => {
      if (value.outcome)
        mutation.mutate({ outcome: value.outcome, reason: value.reason });
    },
  });
  const id = `decision-${milestone.code}`;
  const serverReasonError = isApiError(mutation.error)
    ? mutation.error.fieldErrors.reason
    : undefined;
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="outcome"
        validators={{
          onSubmit: ({ value }) =>
            value ? undefined : 'Choose accept or reject.',
        }}
      >
        {(field) => (
          <fieldset className="grid gap-2">
            <legend className="sr-only">Decision for {milestone.code}</legend>
            <RadioGroup
              value={field.state.value}
              onValueChange={(value) =>
                field.handleChange(value as 'accepted' | 'rejected')
              }
              className="grid gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-accept`} value="accepted" />
                <Label htmlFor={`${id}-accept`} className="font-normal">
                  Accept: completed and supported
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-reject`} value="rejected" />
                <Label htmlFor={`${id}-reject`} className="font-normal">
                  Reject: not completed or not supported
                </Label>
              </div>
            </RadioGroup>
            {field.state.meta.errors[0] && (
              <p className="text-sm text-destructive">
                {String(field.state.meta.errors[0])}
              </p>
            )}
          </fieldset>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.outcome}>
        {(outcome) => (
          <form.Field
            name="reason"
            validators={{
              onSubmit: ({ value, fieldApi }) =>
                fieldApi.form.getFieldValue('outcome') === 'rejected' &&
                value.trim().length < 10
                  ? 'Explain the rejection (at least 10 characters).'
                  : undefined,
            }}
          >
            {(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-reason`}>
                  {outcome === 'rejected'
                    ? 'Reason (shared with the institution as feedback)'
                    : 'Note (optional)'}
                </Label>
                <Textarea
                  id={`${id}-reason`}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={
                    field.state.meta.errors.length > 0 ||
                    Boolean(serverReasonError)
                  }
                  aria-describedby={`${id}-reason-error`}
                />
                <p
                  id={`${id}-reason-error`}
                  className="text-sm text-destructive"
                >
                  {field.state.meta.errors[0]
                    ? String(field.state.meta.errors[0])
                    : serverReasonError}
                </p>
              </div>
            )}
          </form.Field>
        )}
      </form.Subscribe>
      {mutation.isError && !serverReasonError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="sm"
          variant={decision ? 'outline' : 'default'}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? 'Saving…'
            : decision
              ? 'Update decision'
              : 'Save decision'}
        </Button>
        {decision && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Saved by {decision.decidedBy}, {formatDateTime(decision.decidedAt)}
          </span>
        )}
      </div>
    </form>
  );
}

function DecisionSummary({ decision }: { decision: Decision | undefined }) {
  if (!decision)
    return (
      <p className="text-sm text-muted-foreground">No decision recorded.</p>
    );
  const Icon = decision.outcome === 'accepted' ? CircleCheck : CircleX;
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="size-4" aria-hidden="true" />
        {decision.outcome === 'accepted' ? 'Accepted' : 'Rejected'}
      </p>
      {decision.reason && <p>{decision.reason}</p>}
      <p className="text-xs text-muted-foreground">
        {decision.decidedBy}, {formatDateTime(decision.decidedAt)}
      </p>
    </div>
  );
}

function MilestoneReview({
  bundle,
  milestone,
}: {
  bundle: ReviewBundle;
  milestone: Milestone;
}) {
  const response = bundle.answers.milestones[milestone.id];
  const decision = bundle.decisions.find(
    (candidate) => candidate.milestoneId === milestone.id,
  );
  const basis = bundle.score.provisionalCredits.find(
    (credit) => credit.milestoneId === milestone.id,
  )?.basis;
  const column = 'grid content-start gap-2 p-4';
  const heading =
    'text-xs font-semibold tracking-wide text-muted-foreground uppercase';
  return (
    <article
      aria-labelledby={`m-${milestone.code}`}
      className="rounded-lg border bg-card"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 id={`m-${milestone.code}`} className="font-semibold">
          <span className="text-muted-foreground">{milestone.code}</span>{' '}
          {milestone.title}
        </h3>
        <span className="text-sm">
          {decision
            ? decision.outcome === 'accepted'
              ? 'Accepted'
              : 'Rejected'
            : 'Awaiting your decision'}
        </span>
      </header>
      <div className="grid divide-y lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <section className={column} aria-label="Claim">
          <h4 className={heading}>Claim</h4>
          <Claim response={response} basis={basis} />
        </section>
        <section className={column} aria-label="Rule">
          <h4 className={heading}>Rule</h4>
          <p className="text-sm">{milestone.completionCondition}</p>
          <p className="text-xs text-muted-foreground">
            Evidence expected: {milestone.evidenceExpectation} Weight{' '}
            {milestone.weight}
            {milestone.mandatory ? ' · committee obligation' : ''}.
          </p>
        </section>
        <section className={column} aria-label="Evidence">
          <h4 className={heading}>Evidence</h4>
          <Evidence response={response} evidence={bundle.evidence} />
        </section>
        <section className={column} aria-label="Decision">
          <h4 className={heading}>Decision</h4>
          {bundle.canDecide ? (
            <DecisionForm
              bundle={bundle}
              milestone={milestone}
              decision={decision}
            />
          ) : (
            <DecisionSummary decision={decision} />
          )}
        </section>
      </div>
    </article>
  );
}

function OtherAnswers({ bundle }: { bundle: ReviewBundle }) {
  const questions = bundle.form.sections
    .flatMap((section) => section.questions)
    .filter((question) => question.type !== 'milestone_progress');
  return (
    <section
      aria-labelledby="answers-heading"
      className="rounded-lg border bg-card p-5"
    >
      <h2 id="answers-heading" className="font-semibold">
        Committee minutes and other answers
      </h2>
      <dl className="mt-3 grid gap-3 text-sm">
        {questions.map((question) => {
          const value = bundle.answers.questions[question.id];
          let display: string;
          if (question.type === 'evidence') {
            const answer = value as EvidenceAnswer | undefined;
            display = answer?.unavailable
              ? `Declared not available: ${answer.unavailable.explanation}`
              : bundle.evidence
                  .filter((item) => answer?.evidenceIds.includes(item.id))
                  .map((item) => item.fileName)
                  .join(', ') || 'No file';
          } else
            display =
              value === true
                ? 'Yes'
                : value === false
                  ? 'No'
                  : String(value ?? '') || '—';
          return (
            <div key={question.id}>
              <dt className="text-muted-foreground">{question.label}</dt>
              <dd className="whitespace-pre-line">{display}</dd>
            </div>
          );
        })}
      </dl>
      <h3 className="mt-5 text-sm font-semibold">
        Files attached to revision {bundle.item.revision}
      </h3>
      <ul className="mt-2 grid gap-1.5 text-sm">
        {bundle.evidence.map((item) => (
          <li key={item.id} className="text-muted-foreground">
            <span className="font-medium text-foreground">{item.fileName}</span>{' '}
            · {evidenceCategoryLabel[item.category]} ·{' '}
            {formatBytes(item.sizeBytes)} · SHA-256 {item.sha256.slice(0, 12)}…
          </li>
        ))}
      </ul>
    </section>
  );
}

function Finalize({ bundle }: { bundle: ReviewBundle }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => finalizeReview(bundle.submissionId, bundle.item.revision),
    onSuccess: async (next) => {
      queryClient.setQueryData(reviewKeys.detail(bundle.submissionId), next);
      await invalidateReviews(queryClient);
    },
  });
  const undecided = bundle.milestones.filter(
    (milestone) =>
      !bundle.decisions.some(
        (decision) => decision.milestoneId === milestone.id,
      ),
  );
  const rejected = bundle.decisions.filter(
    (decision) => decision.outcome === 'rejected',
  );
  return (
    <section
      aria-labelledby="finalize-heading"
      className="rounded-lg border bg-card p-5"
    >
      <h2 id="finalize-heading" className="font-semibold">
        Finalize this review
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Finalizing records the reviewed result for revision{' '}
        {bundle.item.revision}. The institution sees that review is complete,
        not the score.
      </p>
      {mutation.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>
            {isApiError(mutation.error, 409)
              ? 'This revision is no longer current'
              : 'The review was not finalized'}
          </AlertTitle>
          <AlertDescription>
            {mutation.error.message}
            {isApiError(mutation.error, 409) && (
              <Link
                to="/officer"
                search={{ tab: 'open' }}
                className="mt-1 block font-medium underline"
              >
                Return to the queue to open the latest revision
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={undecided.length > 0 || mutation.isPending}>
              {mutation.isPending ? 'Finalizing…' : 'Finalize review'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Finalize {bundle.item.institutionId}, {bundle.item.periodLabel}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {rejected.length === 0
                  ? 'All milestones are accepted.'
                  : `${rejected.length} milestone${rejected.length === 1 ? ' is' : 's are'} rejected with reasons.`}{' '}
                A finalized review can only be changed by a recorded reopen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
              <AlertDialogAction onClick={() => mutation.mutate()}>
                Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {undecided.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Record a decision for{' '}
            {undecided.map((milestone) => milestone.code).join(', ')} first.
          </p>
        )}
      </div>
    </section>
  );
}

export function ReviewPage() {
  const { submissionId } = route.useParams();
  const review = useQuery(reviewQuery(submissionId));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          review.data
            ? `${review.data.item.institutionId} · ${review.data.item.periodLabel} · revision ${review.data.item.revision}`
            : 'Review'
        }
        title={review.data?.item.institutionName ?? 'Submission review'}
        description={
          review.data && (
            <span className="flex flex-wrap items-center gap-2">
              <WorkflowStateBadge state={review.data.item.state} />
              <FlagList flags={review.data.item.flags} />
              Received {formatDateTime(review.data.receipt.receivedAt)} (
              {review.data.receipt.timeliness === 'on_time'
                ? 'on time'
                : 'late'}
              )
            </span>
          )
        }
        actions={
          <Link
            to="/officer"
            search={{ tab: 'open' }}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            Queue
          </Link>
        }
      />
      <QueryView query={review} label="submission">
        {(bundle) => (
          <div className="grid gap-6">
            {bundle.finalizedAt && (
              <Alert>
                <Lock aria-hidden="true" />
                <AlertTitle>Finalized</AlertTitle>
                <AlertDescription>
                  Finalized by {bundle.finalizedBy},{' '}
                  {formatDateTime(bundle.finalizedAt)}. Decisions are read-only.
                </AlertDescription>
              </Alert>
            )}
            <ScorePanel bundle={bundle} />
            <section
              aria-labelledby="milestones-heading"
              className="grid gap-4"
            >
              <h2 id="milestones-heading" className="text-lg font-semibold">
                Milestones in the locked baseline
              </h2>
              {bundle.milestones.map((milestone) => (
                <MilestoneReview
                  key={milestone.id}
                  bundle={bundle}
                  milestone={milestone}
                />
              ))}
            </section>
            <OtherAnswers bundle={bundle} />
            {bundle.canDecide && <Finalize bundle={bundle} />}
          </div>
        )}
      </QueryView>
    </div>
  );
}
