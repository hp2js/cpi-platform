import type {
  Decision,
  EvidenceAnswer,
  EvidenceItem,
  Milestone,
  MilestoneResponse,
  ReviewBundle,
} from '@cpi/contracts';
import { planQuery } from '@/features/planning/queries';
import { EvidenceLink } from '@/features/reporting/evidence-link';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  FileText,
  History,
  Lock,
  MessageCircleQuestion,
  RefreshCcw,
} from 'lucide-react';
import { useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ClarificationCard } from '@/features/clarifications/clarification-card';
import { invalidateEvents } from '@/features/events/queries';
import {
  evidenceCategoryLabel,
  formatBytes,
} from '@/features/reporting/answers';
import {
  carryForward,
  finalizeReview,
  invalidateReviews,
  recordDecision,
  reopenReview,
  requestClarification,
  reviewKeys,
  reviewQuery,
} from '@/features/review/queries';
import { ComponentScoreValue } from '@/features/review/score-display';
import { useSession } from '@/features/session/use-session';
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

/** Store a returned bundle and refresh the lists and events that depend on it. */
function useReviewMutation<T>(
  bundle: ReviewBundle,
  action: (value: T) => Promise<ReviewBundle>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (next) => {
      queryClient.setQueryData(reviewKeys.detail(bundle.submissionId), next);
      await Promise.all([
        invalidateReviews(queryClient),
        invalidateEvents(queryClient),
      ]);
    },
  });
}

function ScorePanel({ bundle }: { bundle: ReviewBundle }) {
  return (
    <section
      aria-labelledby="score-heading"
      className="rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="score-heading" className="font-semibold">
          Implementation result for {bundle.item.periodLabel}, revision{' '}
          {bundle.item.revision}
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

function Revisions({ bundle }: { bundle: ReviewBundle }) {
  if (bundle.revisions.length < 2) return null;
  const latest = Math.max(
    ...bundle.revisions.map((revision) => revision.revision),
  );
  return (
    <nav
      aria-label="Revisions"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <History className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">Revisions:</span>
      {bundle.revisions.map((revision) =>
        revision.submissionId === bundle.submissionId ? (
          <span
            key={revision.submissionId}
            aria-current="page"
            className="rounded-md bg-accent px-2 py-1 font-medium text-accent-foreground"
          >
            r{revision.revision}{' '}
            {revision.revision === latest ? '(latest)' : ''} ·{' '}
            {formatDateTime(revision.receivedAt)}
          </span>
        ) : (
          <Link
            key={revision.submissionId}
            to="/officer/reviews/$submissionId"
            params={{ submissionId: revision.submissionId }}
            className="rounded-md border px-2 py-1 hover:bg-accent"
          >
            r{revision.revision}{' '}
            {revision.revision === latest ? '(latest)' : ''} ·{' '}
            {formatDateTime(revision.receivedAt)}
          </Link>
        ),
      )}
    </nav>
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
              {item ? (
                <EvidenceLink evidenceId={item.id} fileName={item.fileName} />
              ) : (
                <span className="font-medium">
                  File not attached to this revision
                </span>
              )}
              {item && item.version > 1 && (
                <span className="text-muted-foreground">
                  {' '}
                  (version {item.version})
                </span>
              )}
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
  const mutation = useReviewMutation(
    bundle,
    (value: { outcome: 'accepted' | 'rejected'; reason: string }) =>
      recordDecision(bundle.submissionId, milestone.code, {
        ...value,
        revision: bundle.item.revision,
      }),
  );
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
            {decision.carriedForwardFrom
              ? 'Confirmed from the earlier revision'
              : 'Saved'}{' '}
            by {decision.decidedBy}, {formatDateTime(decision.decidedAt)}
          </span>
        )}
      </div>
    </form>
  );
}

/** Earlier decision for this milestone, and whether it may be carried forward (PRD §7.3, AT27). */
function PriorDecision({
  bundle,
  milestone,
  current,
}: {
  bundle: ReviewBundle;
  milestone: Milestone;
  current: Decision | undefined;
}) {
  const previous = bundle.prior?.decisions.find(
    (decision) => decision.milestoneId === milestone.id,
  );
  const change = bundle.prior?.changes[milestone.id];
  const mutation = useReviewMutation(bundle, () =>
    carryForward(bundle.submissionId, milestone.code, bundle.item.revision),
  );
  if (!bundle.prior || !previous || current) return null;
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3 text-sm">
      {change === 'changed' ? (
        <p className="flex items-start gap-1.5 font-medium">
          <RefreshCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Changed since revision {bundle.prior.revision}: needs a new review.
        </p>
      ) : (
        <p>Unchanged since revision {bundle.prior.revision}.</p>
      )}
      <p className="text-muted-foreground">
        Earlier: {previous.outcome === 'accepted' ? 'accepted' : 'rejected'} by{' '}
        {previous.decidedBy}
        {previous.reason ? ` (“${previous.reason}”)` : ''}.
      </p>
      {change === 'unchanged' && bundle.canDecide && (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="h-auto py-1.5 text-left whitespace-normal"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(undefined)}
          >
            Confirm earlier decision for revision {bundle.item.revision}
          </Button>
          {mutation.isError && (
            <p role="alert" className="mt-1 text-destructive">
              {mutation.error.message}
            </p>
          )}
        </div>
      )}
    </div>
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
  const change = bundle.prior?.changes[milestone.id];
  const column = 'grid min-w-0 content-start gap-2 p-4';
  const heading =
    'text-xs font-semibold tracking-wide text-muted-foreground uppercase';
  const status = decision
    ? decision.outcome === 'accepted'
      ? 'Accepted'
      : 'Rejected'
    : change === 'changed' &&
        bundle.prior?.decisions.some(
          (earlier) => earlier.milestoneId === milestone.id,
        )
      ? 'Needs re-review'
      : 'Awaiting your decision';
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
        <span className="text-sm">{status}</span>
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
          <PriorDecision
            bundle={bundle}
            milestone={milestone}
            current={decision}
          />
          {bundle.canDecide ? (
            <DecisionForm
              key={decision?.id ?? 'new'}
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
            <EvidenceLink evidenceId={item.id} fileName={item.fileName} /> ·{' '}
            {evidenceCategoryLabel[item.category]} · version {item.version} ·{' '}
            {formatBytes(item.sizeBytes)} · SHA-256 {item.sha256.slice(0, 12)}…
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ClarificationDraft {
  code: string | null;
  label: string;
  selected: boolean;
  question: string;
  evidence: string;
}

/** Targeted clarification: one question per criterion, without deleting accepted evidence (FR09). */
function RequestClarification({ bundle }: { bundle: ReviewBundle }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClarificationDraft[]>(() => [
    ...bundle.milestones.map((milestone) => ({
      code: milestone.code,
      label: `${milestone.code} ${milestone.title}`,
      selected: false,
      question: '',
      evidence: '',
    })),
    {
      code: null,
      label: 'The report as a whole',
      selected: false,
      question: '',
      evidence: '',
    },
  ]);
  const mutation = useReviewMutation(bundle, () =>
    requestClarification(bundle.submissionId, {
      revision: bundle.item.revision,
      items: items
        .filter((item) => item.selected)
        .map((item) => ({
          milestoneCode: item.code,
          question: item.question,
          requestedEvidence: item.evidence,
        })),
    }),
  );
  const selected = items.filter((item) => item.selected);
  const invalid =
    selected.length === 0 ||
    selected.some((item) => item.question.trim().length < 10);
  const update = (index: number, patch: Partial<ClarificationDraft>) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MessageCircleQuestion aria-hidden="true" />
        Request clarification
      </Button>
    );
  }
  return (
    <section
      aria-labelledby="clarify-heading"
      className="grid gap-4 rounded-lg border bg-card p-5"
    >
      <div>
        <h2 id="clarify-heading" className="font-semibold">
          Request clarification
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the criteria you are questioning. Decisions already recorded
          stay in the history; the institution will have seven calendar days to
          respond.
        </p>
      </div>
      <ul className="grid gap-3">
        {items.map((item, index) => (
          <li key={item.label} className="grid gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`clarify-${index}`}
                checked={item.selected}
                onCheckedChange={(checked) =>
                  update(index, { selected: checked === true })
                }
              />
              <Label htmlFor={`clarify-${index}`} className="font-normal">
                {item.label}
              </Label>
            </div>
            {item.selected && (
              <div className="grid gap-2 pl-6 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor={`clarify-${index}-question`}>Question</Label>
                  <Textarea
                    id={`clarify-${index}-question`}
                    value={item.question}
                    onChange={(event) =>
                      update(index, { question: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`clarify-${index}-evidence`}>
                    Evidence requested (optional)
                  </Label>
                  <Input
                    id={`clarify-${index}-evidence`}
                    value={item.evidence}
                    onChange={(event) =>
                      update(index, { evidence: event.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={invalid || mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          {mutation.isPending
            ? 'Sending…'
            : `Send ${selected.length || ''} question${selected.length === 1 ? '' : 's'}`}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {invalid && selected.length > 0 && (
          <p className="self-center text-sm text-muted-foreground">
            Each question needs at least 10 characters.
          </p>
        )}
      </div>
    </section>
  );
}

function changedSummary(prior: NonNullable<ReviewBundle['prior']>) {
  const count = Object.values(prior.changes).filter(
    (change) => change === 'changed',
  ).length;
  return count === 1
    ? '1 milestone changed and needs a new review'
    : `${count} milestones changed and need a new review`;
}

function Finalize({ bundle }: { bundle: ReviewBundle }) {
  const mutation = useReviewMutation(bundle, () =>
    finalizeReview(bundle.submissionId, bundle.item.revision),
  );
  const undecided = bundle.milestones.filter(
    (milestone) =>
      !bundle.decisions.some(
        (decision) => decision.milestoneId === milestone.id,
      ),
  );
  const rejected = bundle.decisions.filter(
    (decision) => decision.outcome === 'rejected',
  );
  const openClarification = bundle.clarifications.some(
    (clarification) => clarification.status === 'open',
  );
  // A seeded historical baseline must be confirmed before the quarter is finalized (AT25).
  const plan = useQuery(planQuery(bundle.item.institutionId));
  const seedUnconfirmed =
    plan.data?.baselines.some(
      (baseline) =>
        baseline.periodId === bundle.item.periodId &&
        baseline.status === 'approved' &&
        baseline.historicalSeed !== null &&
        baseline.historicalSeed.confirmedAt === null,
    ) ?? false;
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
            {isApiError(mutation.error) &&
              mutation.error.code === 'seed_unconfirmed' && (
                <Link
                  to="/officer/institutions/$institutionId"
                  params={{ institutionId: bundle.item.institutionId }}
                  className="mt-1 block font-medium underline"
                >
                  Open {bundle.item.institutionId} baselines to confirm
                </Link>
              )}
            {isApiError(mutation.error, 409) && (
              <Link to="/officer" className="mt-1 block font-medium underline">
                Return to the queue to open the latest revision
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={
                undecided.length > 0 ||
                openClarification ||
                seedUnconfirmed ||
                mutation.isPending
              }
            >
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
              <AlertDialogAction onClick={() => mutation.mutate(undefined)}>
                Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {openClarification ? (
          <p className="text-sm text-muted-foreground">
            A clarification is open; finalize after the institution responds.
          </p>
        ) : seedUnconfirmed ? (
          <p className="text-sm text-muted-foreground">
            Confirm that the seeded {bundle.item.periodLabel} baseline matches
            the approved plan first.{' '}
            <Link
              to="/officer/institutions/$institutionId"
              params={{ institutionId: bundle.item.institutionId }}
              className="font-medium text-primary underline"
            >
              Open {bundle.item.institutionId} baselines
            </Link>
          </p>
        ) : (
          undecided.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Record or confirm a decision for{' '}
              {undecided.map((milestone) => milestone.code).join(', ')} first.
            </p>
          )
        )}
      </div>
    </section>
  );
}

/** Controlled reopen before annual publication: a new decision version with a reason (§7.4). */
function Reopen({ bundle }: { bundle: ReviewBundle }) {
  const [reason, setReason] = useState('');
  const mutation = useReviewMutation(bundle, () =>
    reopenReview(bundle.submissionId, reason),
  );
  return (
    <section
      aria-labelledby="reopen-heading"
      className="grid gap-3 rounded-lg border bg-card p-5"
    >
      <h2 id="reopen-heading" className="font-semibold">
        Reopen this review
      </h2>
      <p className="text-sm text-muted-foreground">
        Reopening keeps every earlier decision in the history and tells the
        institution the review is open again.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="reopen-reason">Reason for reopening</Label>
        <Textarea
          id="reopen-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          disabled={reason.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          Reopen with this reason
        </Button>
      </div>
    </section>
  );
}

export function ReviewPage() {
  const { submissionId } = route.useParams();
  const session = useSession();
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
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            Queue
          </Link>
        }
      />
      <QueryView query={review} label="submission">
        {(bundle) => {
          const latest = Math.max(
            ...bundle.revisions.map((revision) => revision.revision),
          );
          const obsolete = bundle.item.revision < latest;
          const openClarification = bundle.clarifications.some(
            (clarification) => clarification.status === 'open',
          );
          return (
            <div className="grid gap-6">
              <Revisions bundle={bundle} />
              {obsolete && (
                <Alert>
                  <History aria-hidden="true" />
                  <AlertTitle>You are viewing an earlier revision</AlertTitle>
                  <AlertDescription>
                    It is kept exactly as received and cannot be decided or
                    finalized. Open the latest revision to continue.
                  </AlertDescription>
                </Alert>
              )}
              {bundle.finalizedAt && (
                <Alert>
                  <Lock aria-hidden="true" />
                  <AlertTitle>Finalized</AlertTitle>
                  <AlertDescription>
                    Finalized by {bundle.finalizedBy},{' '}
                    {formatDateTime(bundle.finalizedAt)}. Decisions are
                    read-only unless the review is reopened.
                  </AlertDescription>
                </Alert>
              )}
              {bundle.prior && !bundle.finalizedAt && (
                <Alert>
                  <RefreshCcw aria-hidden="true" />
                  <AlertTitle>
                    Revision {bundle.item.revision} responds to a clarification
                  </AlertTitle>
                  <AlertDescription>
                    {changedSummary(bundle.prior)} since revision{' '}
                    {bundle.prior.revision}. Unchanged decisions carry forward
                    only when you confirm them.
                  </AlertDescription>
                </Alert>
              )}
              {bundle.reopenings.map((reopening) => (
                <p key={reopening.at} className="text-sm text-muted-foreground">
                  Reopened by {reopening.by}, {formatDateTime(reopening.at)}:{' '}
                  {reopening.reason}
                </p>
              ))}
              <ScorePanel bundle={bundle} />
              {bundle.clarifications.length > 0 && (
                <section
                  aria-labelledby="clarifications-heading"
                  className="grid gap-3"
                >
                  <h2
                    id="clarifications-heading"
                    className="text-lg font-semibold"
                  >
                    Clarifications
                  </h2>
                  {bundle.clarifications.map((clarification) => (
                    <ClarificationCard
                      key={clarification.id}
                      clarification={clarification}
                      audience="officer"
                    />
                  ))}
                </section>
              )}
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
              {bundle.canDecide && !openClarification && (
                <RequestClarification bundle={bundle} />
              )}
              {bundle.canDecide && <Finalize bundle={bundle} />}
              {session.user.role === 'officer' &&
                bundle.finalizedAt &&
                !obsolete && <Reopen bundle={bundle} />}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
