import { useUnsavedWork } from '@/features/session/unsaved-work';
import type { EvidenceItem, ReportAnswers, ReportBundle } from '@cpi/contracts';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRouteApi,
  Link,
  useBlocker,
  useNavigate,
} from '@tanstack/react-router';
import { ArrowRight, CircleCheck, Lock, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
import { WorkflowStateBadge } from '@/components/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { answersFor, replaceEvidence } from '@/features/reporting/answers';
import { ClarificationCard } from '@/features/clarifications/clarification-card';
import {
  MilestoneCard,
  QuestionField,
} from '@/features/reporting/report-fields';
import {
  obligationIdFor,
  reportKeys,
  reportQuery,
  saveDraft,
  uploadEvidence,
} from '@/features/reporting/queries';
import { useSavedDefaultsForm } from '@/features/reporting/use-report-form';
import { useSession } from '@/features/session/use-session';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  formatCalendarDate,
  formatDateRange,
  formatDateTime,
} from '@/lib/dates';

const route = getRouteApi('/authed/institution/reports/$periodId');

/** Whether an answer has been given; a declared-unavailable document counts as answered. */
function isAnswered(value: unknown) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'object' && 'evidenceIds' in value) {
    const answer = value as { evidenceIds: string[]; unavailable: unknown };
    return answer.evidenceIds.length > 0 || answer.unavailable !== null;
  }
  return true;
}

/** Jump links to each section with how much of it is answered, updated as the person types. */
function ReportContents({
  bundle,
  values,
}: {
  bundle: ReportBundle;
  values: ReportAnswers;
}) {
  const form = bundle.form!;
  return (
    <nav aria-label="Report sections" className="grid gap-2 text-sm">
      <p className="font-semibold">In this report</p>
      <ol className="grid gap-1">
        {form.sections.map((section) => {
          let answered = 0;
          let total = 0;
          for (const question of section.questions) {
            if (question.type === 'milestone_progress') {
              for (const milestone of bundle.baseline.milestones) {
                total += 1;
                if (
                  typeof values.milestones[milestone.id]?.completed ===
                  'boolean'
                )
                  answered += 1;
              }
            } else {
              total += 1;
              if (isAnswered(values.questions[question.id])) answered += 1;
            }
          }
          const done = total > 0 && answered === total;
          return (
            <li key={section.id}>
              <a
                href={`#section-${section.id}`}
                className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span>{section.title}</span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    done ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {done ? (
                    <CircleCheck className="inline size-4" aria-hidden="true" />
                  ) : null}{' '}
                  {answered} of {total}
                  <span className="sr-only"> answered</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Links from the review checklist carry the field's id; put the cursor in that field. */
function useFocusLinkedField() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    const control = target.matches('input, textarea, select, button')
      ? target
      : target.querySelector<HTMLElement>(
          'input:not([type=hidden]), textarea, select, button, [role=radio], [tabindex]',
        );
    target.scrollIntoView({ block: 'center' });
    control?.focus({ preventScroll: true });
  }, []);
}

function ReportEditor({
  bundle,
  obligationId,
  onReload,
}: {
  bundle: ReportBundle;
  obligationId: string;
  onReload: () => void;
}) {
  const form = bundle.form!;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { form: reportForm, markSaved } = useSavedDefaultsForm(
    answersFor(form, bundle.baseline.milestones, bundle.draft?.answers),
  );
  const [version, setVersion] = useState(bundle.draft?.version ?? 0);
  const [savedAt, setSavedAt] = useState(bundle.draft?.savedAt ?? null);
  const [savedBy, setSavedBy] = useState(bundle.draft?.savedBy ?? null);
  const session = useSession();
  const dirty = useStore(reportForm.store, (state) => state.isDirty);
  const values = useStore(reportForm.store, (state) => state.values);
  const openClarifications = bundle.clarifications.filter(
    (clarification) => clarification.status === 'open',
  );
  const questionsFor = (milestoneId: string) =>
    openClarifications.flatMap((clarification) =>
      clarification.items.filter((item) => item.milestoneId === milestoneId),
    );
  const questioned = bundle.baseline.milestones.filter(
    (milestone) => questionsFor(milestone.id).length > 0,
  );
  useUnsavedWork(dirty);
  useFocusLinkedField();

  const save = useMutation({
    mutationFn: () => saveDraft(obligationId, version, reportForm.state.values),
    onSuccess: async (draft) => {
      setVersion(draft.version);
      setSavedAt(draft.savedAt);
      setSavedBy(draft.savedBy);
      markSaved(draft.answers);
      await queryClient.invalidateQueries({ queryKey: ['obligations'] });
    },
  });

  const upload = useCallback(
    async (
      file: File,
      category: string,
      onProgress: (fraction: number) => void,
      replaces?: string,
    ): Promise<EvidenceItem> => {
      const item = await uploadEvidence(
        obligationId,
        file,
        category,
        onProgress,
        replaces,
      );
      queryClient.setQueryData<ReportBundle>(
        reportKeys.bundle(obligationId),
        (current) => {
          if (!current) return current;
          const evidence = current.evidence.some(
            (existing) => existing.id === item.id,
          )
            ? current.evidence
            : [
                ...current.evidence.map((existing) =>
                  existing.id === replaces
                    ? { ...existing, supersededBy: item.id }
                    : existing,
                ),
                item,
              ];
          return { ...current, evidence };
        },
      );
      // A replacement keeps every claim pointing at the current version of the file.
      if (replaces && replaces !== item.id) {
        const next = replaceEvidence(
          reportForm.state.values,
          replaces,
          item.id,
        );
        reportForm.setFieldValue('questions', next.questions);
        reportForm.setFieldValue('milestones', next.milestones);
      }
      return item;
    },
    [obligationId, queryClient, reportForm],
  );

  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !save.isPending &&
      !window.confirm('You have unsaved changes. Leave without saving?'),
    enableBeforeUnload: () => dirty,
  });

  async function reviewAndSubmit() {
    if (dirty) {
      try {
        await save.mutateAsync();
      } catch {
        // The save error is shown in the bar; stay on the editor with the entries kept.
        return;
      }
    }
    await queryClient.invalidateQueries({
      queryKey: reportKeys.bundle(obligationId),
    });
    await navigate({
      to: '/institution/reports/$periodId/review',
      params: { periodId: bundle.period.id },
    });
  }

  const conflict = isApiError(save.error, 409);
  return (
    <form
      className="grid gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div
        data-sticky
        className="sticky top-(--sticky-top) z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <p className="text-sm" aria-live="polite">
          {save.isPending ? (
            'Saving…'
          ) : dirty ? (
            <span className="font-medium">Unsaved changes</span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck className="size-4 text-primary" aria-hidden="true" />
              Draft saved {formatDateTime(savedAt)}
              {savedBy &&
                savedBy !== session.user.displayName &&
                ` by ${savedBy}`}
            </span>
          ) : bundle.draft ? (
            'Draft prepared from your last submitted revision'
          ) : (
            'Not saved yet'
          )}
        </p>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            disabled={save.isPending || !dirty}
          >
            <Save aria-hidden="true" />
            Save draft
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => void reviewAndSubmit()}
          >
            Review and submit
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        {save.isError && (
          <Alert variant="destructive" className="basis-full">
            <AlertTitle>
              {conflict
                ? 'This draft changed elsewhere'
                : 'Your draft was not saved'}
            </AlertTitle>
            <AlertDescription>
              <p>
                {save.error.message}
                {!save.error.message.includes('entries are kept') &&
                  ' Your entries on this page are kept.'}
              </p>
              {isApiError(save.error) &&
                save.error.code === 'session_expired' && (
                  <p className="mt-2">
                    <a
                      href="/sign-in"
                      target="_blank"
                      rel="noopener"
                      className="font-medium underline"
                    >
                      Sign in again in a new tab
                    </a>
                    , then return here and save.
                  </p>
                )}
              {conflict && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={onReload}
                >
                  Load the latest saved draft
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {openClarifications.map((clarification) => (
        <ClarificationCard
          key={clarification.id}
          clarification={clarification}
          audience="institution"
        />
      ))}
      {questioned.length > 0 && (
        <nav
          aria-label="Questioned milestones"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span className="font-medium">Go to:</span>
          {questioned.map((milestone) => (
            <a
              key={milestone.id}
              href={`#milestone-${milestone.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {milestone.code} {milestone.title}
            </a>
          ))}
        </nav>
      )}
      {bundle.obligation.state === 'clarification_requested' && (
        <p className="text-sm text-muted-foreground">
          This draft starts from your last submitted revision. Change only what
          the clarification asks about; unchanged answers keep their earlier
          review. Submitting creates a new revision and keeps your earlier
          receipt.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <aside className="rounded-lg border bg-card p-3 lg:sticky lg:top-[calc(var(--sticky-top)+5rem)] lg:order-last">
          <ReportContents bundle={bundle} values={values} />
        </aside>
        <div className="grid gap-8">
          {form.sections.map((section) => (
            <section
              key={section.id}
              aria-labelledby={`section-${section.id}`}
              className="grid scroll-mt-28 gap-5"
            >
              <div>
                <h2
                  id={`section-${section.id}`}
                  className="text-lg font-semibold"
                >
                  {section.title}
                </h2>
                {section.description && (
                  <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                    {section.description}
                  </p>
                )}
              </div>
              {section.questions.map((question) =>
                question.type === 'milestone_progress' ? (
                  <div key={question.id} className="grid gap-4">
                    {bundle.baseline.milestones.map((milestone) => (
                      <MilestoneCard
                        key={milestone.id}
                        form={reportForm}
                        milestone={milestone}
                        evidence={bundle.evidence}
                        questions={questionsFor(milestone.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    key={question.id}
                    className="rounded-lg border bg-card p-4 sm:p-5"
                  >
                    <QuestionField
                      form={reportForm}
                      question={question}
                      evidence={bundle.evidence}
                      upload={upload}
                    />
                  </div>
                ),
              )}
            </section>
          ))}
        </div>
      </div>
    </form>
  );
}

/** During a clarification the response window, not the quarterly deadline, is what is due. */
function ReportDeadline({ bundle }: { bundle: ReportBundle }) {
  const open = bundle.clarifications.find(
    (clarification) => clarification.status === 'open',
  );
  return open ? (
    <>Respond by {formatDateTime(open.responseDueAt)}</>
  ) : (
    <>Due {formatDateTime(bundle.period.submissionDeadline)}</>
  );
}

function Unavailable({ bundle }: { bundle: ReportBundle }) {
  const receipt = bundle.receipts.at(-1);
  if (receipt) {
    return (
      <Alert>
        <Lock aria-hidden="true" />
        <AlertTitle>
          Revision {receipt.revision} was submitted and cannot be changed
        </AlertTitle>
        <AlertDescription>
          <p>
            Submitted revisions are kept exactly as received. If the reviewing
            officer asks for clarification, you will be able to submit a new
            revision.
          </p>
          <Link
            to="/institution/receipts/$receiptId"
            params={{ receiptId: receipt.id }}
            className={buttonVariants({
              variant: 'outline',
              size: 'sm',
              className: 'mt-2',
            })}
          >
            View receipt
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <AlertTitle>
        {bundle.form
          ? 'This report is not open yet'
          : 'The report form has not been published yet'}
      </AlertTitle>
      <AlertDescription>
        {bundle.form
          ? `Reporting opens after the quarter ends on ${formatCalendarDate(bundle.period.endsOn)}.`
          : 'You will be notified when the administrator publishes it. Nothing is needed from you yet.'}
      </AlertDescription>
    </Alert>
  );
}

export function ReportPage() {
  const { periodId } = route.useParams();
  const session = useSession();
  const obligationId = obligationIdFor(
    session.user.institutionId ?? '',
    periodId,
  );
  const bundle = useQuery(reportQuery(obligationId));
  const [generation, setGeneration] = useState(0);
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          bundle.data
            ? `${bundle.data.period.label} · ${formatDateRange(bundle.data.period.startsOn, bundle.data.period.endsOn)}`
            : undefined
        }
        title="Quarterly progress report"
        description={
          bundle.data && (
            <span className="flex flex-wrap items-center gap-2">
              <WorkflowStateBadge
                state={bundle.data.obligation.state}
                audience="institution"
              />
              <ReportDeadline bundle={bundle.data} />
            </span>
          )
        }
      />
      <QueryView query={bundle} label="report">
        {(data) =>
          data.editable ? (
            <ReportEditor
              key={generation}
              bundle={data}
              obligationId={obligationId}
              onReload={() =>
                void bundle
                  .refetch()
                  .then(() => setGeneration((value) => value + 1))
              }
            />
          ) : (
            <Unavailable bundle={data} />
          )
        }
      </QueryView>
    </div>
  );
}
