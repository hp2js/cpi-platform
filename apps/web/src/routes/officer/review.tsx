import type {
  Decision,
  EvidenceItem,
  EvidenceSuitability,
  Milestone,
  MilestoneResponse,
  ReviewBundle,
} from '@cpi/contracts';
import { planQuery } from '@/features/planning/queries';
import { FileViewer } from '@/features/files/file-viewer';
import {
  SuitabilitySection,
  suitabilityStatus,
} from '@/features/review/suitability';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  FileText,
  History,
  Lock,
  MessageCircleQuestion,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { useUnsavedWork } from '@/features/session/unsaved-work';
import { cn } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';
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
  addOversightComment,
  replyToComment,
  closeClarification,
} from '@/features/review/queries';
import { ComponentScoreValue } from '@/features/review/score-display';
import { useSession } from '@/features/session/use-session';
import { isApiError, setOverrideReason } from '@/lib/api';
import { cycleQuery, institutionQuery } from '@/features/directory/queries';
import { formatDateTime, formatDays } from '@/lib/dates';
import { AnswerValue } from '@/features/reporting/answer-value';

/** Officers review their assigned work; the supervisor reads every submission (PRD §5.2). */
const reviewPath = (role: string) =>
  role === 'supervisor'
    ? ('/supervisor/reviews/$submissionId' as const)
    : role === 'administrator'
      ? ('/admin/reviews/$submissionId' as const)
      : ('/officer/reviews/$submissionId' as const);
const queuePath = (role: string) =>
  role === 'supervisor'
    ? ('/supervisor/submissions' as const)
    : role === 'administrator'
      ? ('/admin/reviews' as const)
      : ('/officer' as const);

/**
 * FR10: an administrator acts on a review only through a distinct override with a written
 * justification. While it is on, every action carries the justification and is audited.
 */
function OverridePanel({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState('');
  if (active)
    return (
      <Alert variant="destructive">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>Administrator override is on</AlertTitle>
        <AlertDescription>
          <p>
            Each action you take here is recorded in the audit log with your
            justification. Turn the override off when you are done.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => onChange(null)}
          >
            End override
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <section
      aria-labelledby="override-heading"
      className="grid gap-2 rounded-lg border bg-white p-5"
    >
      <h2 id="override-heading" className="font-bold">
        Administrator override
      </h2>
      <p className="text-sm text-base-dark">
        Review decisions belong to the assigned officer. Use an override only
        when the officer cannot act, for example after an unplanned absence. It
        is a distinct, logged action (FR10).
      </p>
      <Label htmlFor="override-reason">Justification</Label>
      <Textarea
        id="override-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <p className="text-sm text-base-dark">
        At least 20 characters. Recorded with every action you take.
      </p>
      <div>
        <Button
          variant="destructive"
          disabled={reason.trim().length < 20}
          onClick={() => onChange(reason.trim())}
        >
          Turn on override
        </Button>
      </div>
    </section>
  );
}

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
      className="rounded-lg border bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="score-heading" className="font-bold">
          Implementation result for {bundle.item.periodLabel}, revision{' '}
          {bundle.item.revision}
        </h2>
        <p className="text-xs text-base-dark">
          {bundle.score.profileName}
          {bundle.score.simulation && ' · simulation profile'} · internal: the
          institution does not see scores before publication
        </p>
      </div>
      <dl className="mt-4 grid gap-4 tablet:grid-cols-2">
        <div className="rounded-md bg-base-lightest p-4">
          <dt className="text-sm font-bold">
            Provisional (from claims and supplied files)
          </dt>
          <dd className="mt-1">
            <ComponentScoreValue score={bundle.score.provisional} />
          </dd>
        </div>
        <div className="rounded-md bg-primary-lighter p-4">
          <dt className="text-sm font-bold">
            Reviewed (from {bundle.canDecide ? 'your' : 'the officer’s'}{' '}
            decisions)
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
  const session = useSession();
  if (bundle.revisions.length < 2) return null;
  const latest = Math.max(
    ...bundle.revisions.map((revision) => revision.revision),
  );
  return (
    <nav
      aria-label="Revisions"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <History className="size-4 text-base-dark" aria-hidden="true" />
      <span className="text-base-dark">Revisions:</span>
      {bundle.revisions.map((revision) =>
        revision.submissionId === bundle.submissionId ? (
          <span
            key={revision.submissionId}
            aria-current="page"
            className="rounded-md bg-primary-lighter px-2 py-1 font-bold text-primary-darker"
          >
            r{revision.revision}{' '}
            {revision.revision === latest ? '(latest)' : ''} ·{' '}
            {formatDateTime(revision.receivedAt)}
          </span>
        ) : (
          <Link
            key={revision.submissionId}
            to={reviewPath(session.user.role)}
            params={{ submissionId: revision.submissionId }}
            className="rounded-md border px-2 py-1 hover:bg-primary-lighter"
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
    return <p className="text-sm text-base-dark">No response recorded.</p>;
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-bold">
        {response.completed ? 'Reported completed' : 'Reported not completed'}
      </p>
      {response.completed ? (
        <p>
          <span className="text-base-dark">Output: </span>
          {response.output || '—'}
        </p>
      ) : (
        <>
          <p>
            <span className="text-base-dark">Why not: </span>
            {response.emergingIssues || '—'}
          </p>
          <p>
            <span className="text-base-dark">Actions: </span>
            {response.actions || '—'}
          </p>
        </>
      )}
      {basis && (
        <p className="text-xs text-base-dark">
          Provisional basis: {basisLabel[basis]}
        </p>
      )}
    </div>
  );
}

function Evidence({
  response,
  evidence,
  suitability,
}: {
  response: MilestoneResponse | undefined;
  evidence: EvidenceItem[];
  suitability: EvidenceSuitability[];
}) {
  if (!response?.completed)
    return <p className="text-sm text-base-dark">No completion claimed.</p>;
  return (
    <div className="grid gap-2 text-sm">
      {response.evidence.map((reference) => {
        const item = evidence.find(
          (candidate) => candidate.id === reference.evidenceId,
        );
        return (
          <p key={reference.evidenceId} className="flex items-start gap-2">
            <FileText
              className="mt-1 size-4 shrink-0 text-base-dark"
              aria-hidden="true"
            />
            <span>
              {item ? (
                <FileViewer file={item} />
              ) : (
                <span className="font-bold">
                  File not attached to this revision
                </span>
              )}
              {item && item.version > 1 && (
                <span className="text-base-dark">
                  {' '}
                  (version {item.version})
                </span>
              )}
              <span className="block text-base-dark">
                Cited: {reference.passage || 'no passage given'}
              </span>
              {item && (
                <span className="block text-xs text-base-dark">
                  {
                    suitabilityStatus(
                      suitability.find(
                        (record) => record.evidenceId === item.id,
                      ),
                    ).label
                  }
                </span>
              )}
            </span>
          </p>
        );
      })}
      {response.evidenceUnavailable && (
        <p>
          <span className="font-bold">Declared unavailable: </span>
          {response.evidenceUnavailable.explanation}
        </p>
      )}
      {response.evidence.length === 0 && !response.evidenceUnavailable && (
        <p className="text-base-dark">No evidence referenced.</p>
      )}
    </div>
  );
}

function DecisionForm({
  bundle,
  milestone,
  decision,
  onUnsavedChange,
}: {
  bundle: ReviewBundle;
  milestone: Milestone;
  decision: Decision | undefined;
  /** Tells the page when this card holds a choice that differs from the saved decision. */
  onUnsavedChange: (code: string, unsaved: boolean) => void;
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
  const unsaved = useStore(
    form.store,
    (state) =>
      state.values.outcome !== (decision?.outcome ?? '') ||
      state.values.reason !== (decision?.reason ?? ''),
  );
  useEffect(() => {
    onUnsavedChange(milestone.code, unsaved);
  }, [milestone.code, unsaved, onUnsavedChange]);
  useEffect(
    () => () => onUnsavedChange(milestone.code, false),
    [milestone.code, onUnsavedChange],
  );
  const id = `decision-${milestone.code}`;
  const note = acceptNote(bundle, milestone);
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
            {note && (
              <p
                id={`${id}-accept-note`}
                className="flex items-start gap-2 bg-info-lighter px-3 py-2 text-xs"
              >
                <Info className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {note.text}{' '}
                  {note.checks && (
                    <a href="#suitability-heading" className="usa-link">
                      Go to the evidence checks
                    </a>
                  )}
                </span>
              </p>
            )}
            <RadioGroup
              value={field.state.value}
              onValueChange={(value) =>
                field.handleChange(value as 'accepted' | 'rejected')
              }
              className="grid gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  id={`${id}-accept`}
                  value="accepted"
                  aria-describedby={note ? `${id}-accept-note` : undefined}
                />
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
              <p className="text-sm font-bold text-error-dark">
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
              <div className="grid gap-2">
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
                  className="text-sm font-bold text-error-dark"
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
        <p role="alert" className="text-sm font-bold text-error-dark">
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
          <span className="text-xs text-base-dark" aria-live="polite">
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

/**
 * Why accepting would be refused right now, from the documented API rule (docs/api-handover.md:
 * suitability_required, evidence_deficient, evidence_required). Guidance only; the API decides.
 */
function acceptNote(bundle: ReviewBundle, milestone: Milestone) {
  const cited = (bundle.answers.milestones[milestone.id]?.evidence ?? []).map(
    (reference) => reference.evidenceId,
  );
  const name = (id: string) =>
    bundle.evidence.find((item) => item.id === id)?.fileName ?? id;
  const record = (id: string) =>
    bundle.suitability.find((candidate) => candidate.evidenceId === id);
  if (cited.length === 0)
    return {
      text: 'No file is cited, so this claim cannot be accepted. Reject with a reason, or ask for the file through a clarification.',
      checks: false,
    };
  const unchecked = cited.filter((id) => !record(id));
  if (unchecked.length > 0)
    return {
      text: `Check ${unchecked.map(name).join(', ')} before accepting.`,
      checks: true,
    };
  if (cited.every((id) => record(id)!.deficient))
    return {
      text: `${cited.map(name).join(', ')} failed a suitability check, so it cannot support accepting this claim.`,
      checks: false,
    };
  return null;
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
    <div className="grid gap-2 bg-base-lightest p-3 text-sm">
      {change === 'changed' ? (
        <p className="flex items-start gap-2 font-bold">
          <RefreshCcw className="mt-1 size-4 shrink-0" aria-hidden="true" />
          Changed since revision {bundle.prior.revision}: needs a new review.
        </p>
      ) : (
        <p>Unchanged since revision {bundle.prior.revision}.</p>
      )}
      <p className="text-base-dark">
        Earlier: {previous.outcome === 'accepted' ? 'accepted' : 'rejected'} by{' '}
        {previous.decidedBy}
        {previous.reason ? ` (“${previous.reason}”)` : ''}.
      </p>
      {change === 'unchanged' && bundle.canDecide && (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="h-auto max-w-full shrink py-2 text-left whitespace-normal"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(undefined)}
          >
            Confirm earlier decision for revision {bundle.item.revision}
          </Button>
          {mutation.isError && (
            <p role="alert" className="mt-1 text-error-dark">
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
    return <p className="text-sm text-base-dark">No decision recorded.</p>;
  const Icon = decision.outcome === 'accepted' ? CircleCheck : CircleX;
  return (
    <div className="grid gap-1 text-sm">
      <p className="flex items-center gap-2 font-bold">
        <Icon className="size-4" aria-hidden="true" />
        {decision.outcome === 'accepted' ? 'Accepted' : 'Rejected'}
      </p>
      {decision.reason && <p>{decision.reason}</p>}
      <p className="text-xs text-base-dark">
        {decision.decidedBy}, {formatDateTime(decision.decidedAt)}
      </p>
    </div>
  );
}

function MilestoneReview({
  bundle,
  milestone,
  unsaved,
  onUnsavedChange,
}: {
  bundle: ReviewBundle;
  milestone: Milestone;
  unsaved: boolean;
  onUnsavedChange: (code: string, unsaved: boolean) => void;
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
  const heading = 'text-xs font-bold tracking-wide text-base-dark uppercase';
  const status = decision
    ? decision.outcome === 'accepted'
      ? 'Accepted'
      : 'Rejected'
    : change === 'changed' &&
        bundle.prior?.decisions.some(
          (earlier) => earlier.milestoneId === milestone.id,
        )
      ? 'Needs re-review'
      : bundle.canDecide
        ? 'Awaiting your decision'
        : 'Awaiting the officer’s decision';
  return (
    <article
      aria-labelledby={`m-${milestone.code}`}
      className="rounded-lg border bg-white"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 id={`m-${milestone.code}`} className="font-bold">
          <span className="text-base-dark">{milestone.code}</span>{' '}
          {milestone.title}
        </h3>
        {unsaved ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            <CircleAlert
              className="size-4 shrink-0 text-warning-darker"
              aria-hidden="true"
            />
            Unsaved choice
          </span>
        ) : (
          <span className="text-sm">{status}</span>
        )}
      </header>
      <div className="grid divide-y desktop:grid-cols-4 desktop:divide-x desktop:divide-y-0">
        <section className={column} aria-label="Claim">
          <h4 className={heading}>Claim</h4>
          <Claim response={response} basis={basis} />
        </section>
        <section className={column} aria-label="Rule">
          <h4 className={heading}>Rule</h4>
          <p className="text-sm">{milestone.completionCondition}</p>
          <p className="text-xs text-base-dark">
            Evidence expected: {milestone.evidenceExpectation} Weight{' '}
            {milestone.weight}
            {milestone.mandatory ? ' · committee obligation' : ''}.
          </p>
        </section>
        <section className={column} aria-label="Evidence">
          <h4 className={heading}>Evidence</h4>
          <Evidence
            response={response}
            evidence={bundle.evidence}
            suitability={bundle.suitability}
          />
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
              onUnsavedChange={onUnsavedChange}
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
      className="rounded-lg border bg-white p-5"
    >
      <h2 id="answers-heading" className="font-bold">
        Committee minutes and other answers
      </h2>
      <dl className="mt-3 grid gap-3 text-sm">
        {questions.map((question) => {
          return (
            <div key={question.id}>
              <dt className="text-base-dark">{question.label}</dt>
              <dd className="whitespace-pre-line">
                <AnswerValue
                  question={question}
                  value={bundle.answers.questions[question.id]}
                  evidence={bundle.evidence}
                />
              </dd>
            </div>
          );
        })}
      </dl>
      <h3 className="mt-5 text-sm font-bold">
        Files attached to revision {bundle.item.revision}
      </h3>
      <ul className="mt-2 grid gap-2 text-sm">
        {bundle.evidence.map((item) => (
          <li key={item.id} className="text-base-dark">
            <FileViewer file={item} /> · {evidenceCategoryLabel[item.category]}{' '}
            · version {item.version} · {formatBytes(item.sizeBytes)} · SHA-256{' '}
            {item.sha256.slice(0, 12)}…
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
  const cycle = useQuery(cycleQuery);
  const institution = useQuery(institutionQuery(bundle.item.institutionId));
  const unreachable = institution.data?.activeFocalPersons === 0;
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
      className="grid gap-4 rounded-lg border bg-white p-5"
    >
      <div>
        <h2 id="clarify-heading" className="font-bold">
          Request clarification
        </h2>
        <p className="mt-1 text-sm text-base-dark">
          Choose the criteria you are questioning. Decisions already recorded
          stay in the history; the institution will have{' '}
          {formatDays(
            cycle.data?.dayCounting.clarificationDays ?? 7,
            cycle.data?.dayCounting.mode ?? 'calendar',
          )}{' '}
          to respond.
        </p>
      </div>
      {unreachable && (
        <Alert variant="destructive">
          <AlertTitle>Nobody can receive this clarification</AlertTitle>
          <AlertDescription>
            {bundle.item.institutionId} has no active focal person, so the
            request would reach no one while its response window runs. Ask the
            administrator to set up a focal person first.
          </AlertDescription>
        </Alert>
      )}
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
              <div className="grid gap-2 pl-6 tablet:grid-cols-2">
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
        <p role="alert" className="text-sm font-bold text-error-dark">
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
          <p className="self-center text-sm text-base-dark">
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

/** After the window and the cutoff, the officer can close an unanswered clarification (§7.3). */
function CloseUnanswered({
  bundle,
  clarificationId,
}: {
  bundle: ReviewBundle;
  clarificationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mutation = useReviewMutation(bundle, () =>
    closeClarification(bundle.submissionId, clarificationId, reason),
  );
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Close unanswered
      </Button>
    );
  return (
    <div className="grid gap-2">
      <Label htmlFor={`close-${clarificationId}`}>
        Why it is closed without a response
      </Label>
      <Textarea
        id={`close-${clarificationId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <p className="text-sm text-base-dark">
        Allowed only after the response window and the evaluation cutoff (or an
        authorized extension) have both passed. Decide the questioned milestones
        afterwards; unsupported claims are rejected with a reason.
      </p>
      {mutation.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
          {mutation.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={reason.trim().length < 10 || mutation.isPending}
          onClick={() => mutation.mutate(undefined)}
        >
          Close clarification
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The thread under one comment; the officer may also mark the comment addressed. */
function CommentReply({
  bundle,
  comment,
  role,
}: {
  bundle: ReviewBundle;
  comment: ReviewBundle['comments'][number];
  role: 'officer' | 'supervisor';
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [addressed, setAddressed] = useState(false);
  const mutation = useReviewMutation(bundle, () =>
    replyToComment(bundle.submissionId, comment.id, { text, addressed }),
  );
  const fieldId = `reply-${comment.id}`;
  if (!open)
    return (
      <div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {role === 'officer' && comment.status === 'open'
            ? 'Reply or mark addressed'
            : 'Reply'}
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(undefined, {
          onSuccess: () => {
            setText('');
            setAddressed(false);
            setOpen(false);
          },
        });
      }}
    >
      <Label htmlFor={fieldId}>Reply</Label>
      <Textarea
        id={fieldId}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {role === 'officer' && comment.status === 'open' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${fieldId}-addressed`}
            checked={addressed}
            onCheckedChange={(value) => setAddressed(value === true)}
          />
          <Label htmlFor={`${fieldId}-addressed`} className="font-normal">
            Mark the comment addressed
          </Label>
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
          {mutation.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={text.trim().length < 2 || mutation.isPending}
        >
          Send reply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Supervisor guidance for the officer; never shown to the institution, never an approval gate. */
function OversightComments({
  bundle,
  canComment,
  replyAs,
}: {
  bundle: ReviewBundle;
  canComment: boolean;
  /** Who may reply in the thread: the assigned officer or the supervisor. */
  replyAs: 'officer' | 'supervisor' | null;
}) {
  const [text, setText] = useState('');
  const mutation = useReviewMutation(bundle, () =>
    addOversightComment(bundle.submissionId, text),
  );
  if (!canComment && bundle.comments.length === 0) return null;
  return (
    <section
      aria-labelledby="comments-heading"
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <h2 id="comments-heading" className="font-bold">
        Oversight comments
      </h2>
      <p className="text-sm text-base-dark">
        From the supervisor to the officer. They support oversight and are not
        an approval step: an open comment never blocks finalizing. The
        institution does not see them.
      </p>
      {bundle.comments.length > 0 && (
        <ul className="grid gap-2">
          {bundle.comments.map((comment) => (
            <li
              key={comment.id}
              className="grid gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={comment.status === 'open' ? 'secondary' : 'outline'}
                >
                  {comment.status === 'open'
                    ? 'Open'
                    : `Addressed${comment.addressedAt ? ` ${formatDateTime(comment.addressedAt)}` : ''}`}
                </Badge>
                <span className="text-base-dark">
                  {comment.author}, {formatDateTime(comment.at)} · on revision{' '}
                  {comment.revision}
                </span>
              </div>
              <p className="whitespace-pre-line">{comment.text}</p>
              {comment.replies.length > 0 && (
                <ol aria-label="Replies" className="grid gap-2 border-l-2 pl-3">
                  {comment.replies.map((reply) => (
                    <li key={`${reply.at}-${reply.author}`}>
                      <p className="whitespace-pre-line">{reply.text}</p>
                      <p className="text-xs text-base-dark">
                        {reply.author} ({reply.role}),{' '}
                        {formatDateTime(reply.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              {replyAs && (
                <CommentReply
                  bundle={bundle}
                  comment={comment}
                  role={replyAs}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(undefined, { onSuccess: () => setText('') });
          }}
        >
          <Label htmlFor="oversight-comment">Add a comment</Label>
          <Textarea
            id="oversight-comment"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {mutation.isError && (
            <p role="alert" className="text-sm text-error-dark">
              {mutation.error.message}
            </p>
          )}
          <div>
            <Button
              type="submit"
              variant="outline"
              disabled={text.trim().length < 10 || mutation.isPending}
            >
              Post comment
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** What still stands between this review and finalizing; one source for the button and the progress panel. */
function useFinalizeBlockers(bundle: ReviewBundle) {
  const undecided = bundle.milestones.filter(
    (milestone) =>
      !bundle.decisions.some(
        (decision) => decision.milestoneId === milestone.id,
      ),
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
  return {
    undecided,
    openClarification,
    seedUnconfirmed,
    ready: undecided.length === 0 && !openClarification && !seedUnconfirmed,
  };
}

/**
 * The review's remaining steps, near the top of a long page: each links to where it is done,
 * and shows its state with an icon and words, not colour alone.
 */
function ReviewProgress({
  bundle,
  unsaved,
}: {
  bundle: ReviewBundle;
  /** Milestone codes with a choice that is not saved yet. */
  unsaved: string[];
}) {
  const { undecided, openClarification, seedUnconfirmed, ready } =
    useFinalizeBlockers(bundle);
  const checked = bundle.evidence.filter((item) =>
    bundle.suitability.some((record) => record.evidenceId === item.id),
  ).length;
  const decided = bundle.milestones.length - undecided.length;
  const steps: {
    done: boolean;
    label: string;
    href?: string;
    to?: 'baselines';
  }[] = [
    ...(bundle.evidence.length > 0
      ? [
          {
            done: checked === bundle.evidence.length,
            label: `Evidence checked: ${checked} of ${bundle.evidence.length} file${bundle.evidence.length === 1 ? '' : 's'}`,
            href: '#suitability-heading',
          },
        ]
      : []),
    {
      done: undecided.length === 0,
      label: `Decisions: ${decided} of ${bundle.milestones.length} milestones`,
      href: '#milestones-heading',
    },
    ...(unsaved.length > 0
      ? [
          {
            done: false,
            label: `Not saved: ${unsaved.join(', ')}`,
            href: `#m-${unsaved[0]}`,
          },
        ]
      : []),
    ...(seedUnconfirmed
      ? [
          {
            done: false,
            label: 'Baseline not confirmed yet',
            to: 'baselines' as const,
          },
        ]
      : []),
    ...(openClarification
      ? [
          {
            done: false,
            label: 'Clarification open: waiting for the institution',
            href: '#clarifications-heading',
          },
        ]
      : []),
    {
      done: false,
      label: ready ? 'Ready to finalize' : 'Finalize',
      href: '#finalize-heading',
    },
  ];
  return (
    <nav
      aria-label="Review progress"
      data-print-hide
      className="border border-base-lighter bg-white px-4 py-2"
    >
      <ol className="flex flex-wrap gap-x-6">
        {steps.map((step) => {
          const Icon = step.done ? CircleCheck : Circle;
          const content = (
            <>
              <Icon
                className={cn(
                  'size-5 shrink-0',
                  step.done ? 'text-success-darker' : 'text-base-dark',
                )}
                aria-hidden="true"
              />
              {step.label}
              {step.done && <span className="sr-only"> (done)</span>}
            </>
          );
          const className =
            'inline-flex min-h-touch items-center gap-2 text-sm text-ink underline-offset-2 hover:text-primary hover:underline';
          return (
            <li key={step.label}>
              {step.to === 'baselines' ? (
                <Link
                  to="/officer/institutions/$institutionId"
                  params={{ institutionId: bundle.item.institutionId }}
                  className={cn(className, 'font-bold text-error-dark')}
                >
                  {content}
                </Link>
              ) : (
                <a
                  href={step.href}
                  className={cn(className, step.done && 'text-base-dark')}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Finalize({ bundle }: { bundle: ReviewBundle }) {
  const mutation = useReviewMutation(bundle, () =>
    finalizeReview(bundle.submissionId, bundle.item.revision),
  );
  const { undecided, openClarification, seedUnconfirmed } =
    useFinalizeBlockers(bundle);
  const rejected = bundle.decisions.filter(
    (decision) => decision.outcome === 'rejected',
  );
  return (
    <section
      aria-labelledby="finalize-heading"
      className="rounded-lg border bg-white p-5"
    >
      <h2 id="finalize-heading" className="font-bold">
        Finalize this review
      </h2>
      <p className="mt-1 text-sm text-base-dark">
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
                  className="mt-1 block font-bold underline"
                >
                  Open {bundle.item.institutionId} baselines to confirm
                </Link>
              )}
            {isApiError(mutation.error, 409) && (
              <Link to="/officer" className="mt-1 block font-bold underline">
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
          <p className="text-sm text-base-dark">
            A clarification is open; finalize after the institution responds.
          </p>
        ) : seedUnconfirmed ? (
          <p className="text-sm text-base-dark">
            Confirm that the seeded {bundle.item.periodLabel} baseline matches
            the approved plan first.{' '}
            <Link
              to="/officer/institutions/$institutionId"
              params={{ institutionId: bundle.item.institutionId }}
              className="font-bold text-primary underline"
            >
              Open {bundle.item.institutionId} baselines
            </Link>
          </p>
        ) : (
          undecided.length > 0 && (
            <p className="text-sm text-base-dark">
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
      className="grid gap-3 rounded-lg border bg-white p-5"
    >
      <h2 id="reopen-heading" className="font-bold">
        Reopen this review
      </h2>
      <p className="text-sm text-base-dark">
        Reopening keeps every earlier decision in the history and tells the
        institution the review is open again.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="reopen-reason">Reason for reopening</Label>
        <Textarea
          id="reopen-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm font-bold text-error-dark">
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
  const { submissionId } = useParams({ strict: false }) as {
    submissionId: string;
  };
  const session = useSession();
  const supervisor = session.user.role === 'supervisor';
  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    setOverrideReason(override);
    return () => setOverrideReason(null);
  }, [override]);
  const review = useQuery(reviewQuery(submissionId));
  // Decisions save one milestone at a time; a chosen but unsaved decision must not be lost.
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const onUnsavedChange = useCallback(
    (code: string, pending: boolean) =>
      setUnsaved((current) =>
        pending
          ? current.includes(code)
            ? current
            : [...current, code].sort()
          : current.filter((candidate) => candidate !== code),
      ),
    [],
  );
  useUnsavedWork(unsaved.length > 0);
  useBlocker({
    shouldBlockFn: () =>
      unsaved.length > 0 &&
      !window.confirm(
        `Your decision for ${unsaved.join(', ')} is not saved. Leave without saving?`,
      ),
    enableBeforeUnload: () => unsaved.length > 0,
  });
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
                : `late by ${formatDays(review.data.receipt.daysLate, review.data.receipt.daysLateUnit)}`}
              {!review.data.receipt.evidenceComplete &&
                '; some evidence declared unavailable'}
              )
            </span>
          )
        }
        actions={
          <Link
            to={queuePath(session.user.role)}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            {session.user.role === 'officer' ? 'Queue' : 'Submissions'}
          </Link>
        }
      />
      <QueryView query={review} label="submission">
        {(loaded) => {
          // Under an active override the administrator gets the officer's controls.
          const bundle =
            override && loaded.canOverride
              ? { ...loaded, canDecide: true }
              : loaded;
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
              {loaded.canOverride && (
                <OverridePanel
                  active={override !== null}
                  onChange={setOverride}
                />
              )}
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
              {session.user.role === 'officer' &&
                bundle.comments.some(
                  (comment) => comment.status === 'open',
                ) && (
                  <Alert>
                    <AlertDescription>
                      <span>
                        The supervisor left{' '}
                        {
                          bundle.comments.filter(
                            (comment) => comment.status === 'open',
                          ).length
                        }{' '}
                        open oversight comment(s).{' '}
                        <a
                          href="#comments-heading"
                          className="text-primary underline underline-offset-4"
                        >
                          Read and reply
                        </a>
                        . They never block finalizing.
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
              {bundle.reopenings.map((reopening) => (
                <p key={reopening.at} className="text-sm text-base-dark">
                  Reopened by {reopening.by}, {formatDateTime(reopening.at)}:{' '}
                  {reopening.reason}
                </p>
              ))}
              {bundle.canDecide && !bundle.finalizedAt && !obsolete && (
                <ReviewProgress bundle={bundle} unsaved={unsaved} />
              )}
              <ScorePanel bundle={bundle} />
              {bundle.clarifications.length > 0 && (
                <section
                  aria-labelledby="clarifications-heading"
                  className="grid gap-3"
                >
                  <h2 id="clarifications-heading" className="text-lg font-bold">
                    Clarifications
                  </h2>
                  {bundle.clarifications.map((clarification) => (
                    <ClarificationCard
                      key={clarification.id}
                      clarification={clarification}
                      audience="officer"
                      actions={
                        bundle.canDecide &&
                        clarification.status === 'open' &&
                        clarification.overdue ? (
                          <CloseUnanswered
                            bundle={bundle}
                            clarificationId={clarification.id}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </section>
              )}
              <SuitabilitySection bundle={bundle} />
              <section
                aria-labelledby="milestones-heading"
                className="grid gap-4"
              >
                <h2 id="milestones-heading" className="text-lg font-bold">
                  Milestones in the locked baseline
                </h2>
                {bundle.milestones.map((milestone) => (
                  <MilestoneReview
                    key={milestone.id}
                    bundle={bundle}
                    milestone={milestone}
                    unsaved={unsaved.includes(milestone.code)}
                    onUnsavedChange={onUnsavedChange}
                  />
                ))}
              </section>
              <OtherAnswers bundle={bundle} />
              <OversightComments
                bundle={bundle}
                canComment={supervisor}
                replyAs={
                  supervisor
                    ? 'supervisor'
                    : session.user.role === 'officer'
                      ? 'officer'
                      : null
                }
              />
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
