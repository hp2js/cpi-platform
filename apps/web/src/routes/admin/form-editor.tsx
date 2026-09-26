import { useUnsavedWork } from '@/features/session/unsaved-work';
import type {
  FormDraftUpdate,
  FormIssue,
  FormVersion,
  Milestone,
  Question,
  QuestionType,
} from '@cpi/contracts';
import { useForm, useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useBlocker } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Lock,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useId, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryView } from '@/components/query-view';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cycleQuery } from '@/features/directory/queries';
import {
  formKeys,
  formQuery,
  formValidationQuery,
  invalidateForms,
  publishForm,
  saveForm,
} from '@/features/forms/queries';
import {
  answersFor,
  evidenceCategoryLabel,
} from '@/features/reporting/answers';
import {
  MilestoneCard,
  QuestionField,
} from '@/features/reporting/report-fields';
import { useSavedDefaultsForm } from '@/features/reporting/use-report-form';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';

const route = getRouteApi('/authed/admin/forms/$formId');

const typeLabels: Record<QuestionType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'Date',
  yes_no: 'Yes / no',
  choice: 'Choice',
  evidence: 'Evidence upload',
  milestone_progress: 'Milestone progress (scored)',
};
const addableTypes = (Object.keys(typeLabels) as QuestionType[]).filter(
  (type) => type !== 'milestone_progress',
);

const weightFields = [
  ['procedures', 'Procedures'],
  ['riskAssessment', 'Risk assessment'],
  ['mitigationPlan', 'Mitigation plan'],
  ['implementation', 'Implementation'],
] as const;

const editableOf = (form: FormVersion): FormDraftUpdate => ({
  title: form.title,
  periodIds: form.periodIds,
  sections: form.sections,
  weights: form.weights,
});

/** Stable, unique identifiers are generated, never typed, so answers keep their meaning. */
function nextId(prefix: string, taken: string[]) {
  let index = taken.length + 1;
  while (taken.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function issueAnchor(path: string) {
  const match = /^sections\.(\d+)(?:\.questions\.(\d+))?/.exec(path);
  if (match)
    return match[2] ? `edit-s${match[1]}-q${match[2]}` : `edit-s${match[1]}`;
  if (path.startsWith('weights')) return 'edit-weights';
  if (path.startsWith('periodIds')) return 'edit-periods';
  return 'edit-title';
}

function issueLocation(path: string) {
  const match = /^sections\.(\d+)(?:\.questions\.(\d+))?/.exec(path);
  if (match)
    return match[2]
      ? `Section ${Number(match[1]) + 1}, question ${Number(match[2]) + 1}`
      : `Section ${Number(match[1]) + 1}`;
  if (path.startsWith('weights')) return 'Scoring weights';
  if (path.startsWith('periodIds')) return 'Periods';
  return 'Form';
}

const previewMilestones: Milestone[] = [
  {
    id: 'PREVIEW:M-01',
    code: 'M-01',
    title: 'Example planned milestone',
    activity: 'A-01 Example activity from the approved plan',
    risk: 'R-01 Example risk',
    completionCondition: 'Each institution sees its own locked baseline here.',
    evidenceExpectation: 'Minutes or progress report passage.',
    weight: 1,
    mandatory: false,
  },
];

function Preview({ form }: { form: FormVersion }) {
  const { form: previewForm } = useSavedDefaultsForm(
    answersFor(form, previewMilestones),
  );
  const rejectUpload = () =>
    Promise.reject(new Error('Uploads are disabled in preview.'));
  return (
    <div className="grid gap-6">
      <Alert>
        <AlertDescription>
          Preview as an institution sees it. Nothing entered here is saved.
        </AlertDescription>
      </Alert>
      {form.sections.map((section) => (
        <section key={section.id} className="grid gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {section.title || 'Untitled section'}
            </h2>
            {section.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {section.description}
              </p>
            )}
          </div>
          {section.questions.map((question) =>
            question.type === 'milestone_progress' ? (
              previewMilestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  form={previewForm}
                  milestone={milestone}
                  evidence={[]}
                />
              ))
            ) : (
              <div key={question.id} className="rounded-lg border bg-card p-4">
                <QuestionField
                  form={previewForm}
                  question={question}
                  evidence={[]}
                  upload={rejectUpload}
                />
              </div>
            ),
          )}
        </section>
      ))}
    </div>
  );
}

function Issues({ issues }: { issues: FormIssue[] }) {
  if (issues.length === 0)
    return <p className="text-sm">No issues: this version can be published.</p>;
  return (
    <ul className="grid gap-1.5 text-sm">
      {issues.map((issue) => (
        <li key={`${issue.path}-${issue.message}`}>
          <a
            href={`#${issueAnchor(issue.path)}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {issueLocation(issue.path)}
          </a>
          : {issue.message}
        </li>
      ))}
    </ul>
  );
}

function DraftEditor({ form }: { form: FormVersion }) {
  const queryClient = useQueryClient();
  const cycle = useQuery(cycleQuery);
  const validation = useQuery(formValidationQuery(form.id));
  const [defaults, setDefaults] = useState(editableOf(form));
  const editor = useForm({ defaultValues: defaults });
  const dirty = useStore(editor.store, (state) => state.isDirty);
  useUnsavedWork(dirty);
  const values = useStore(editor.store, (state) => state.values);

  const save = useMutation({
    mutationFn: () => saveForm(form.id, editor.state.values),
    onSuccess: async (saved) => {
      const next = editableOf(saved);
      setDefaults(next);
      editor.reset(next);
      queryClient.setQueryData(formKeys.detail(form.id), saved);
      await queryClient.invalidateQueries({
        queryKey: formKeys.validation(form.id),
      });
    },
  });
  const publish = useMutation({
    mutationFn: () => publishForm(form.id),
    onSuccess: async (published) => {
      queryClient.setQueryData(formKeys.detail(form.id), published);
      await invalidateForms(queryClient);
    },
  });

  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !window.confirm(
        'You have unsaved changes to this form. Leave without saving?',
      ),
    enableBeforeUnload: () => dirty,
  });

  const allQuestionIds = values.sections.flatMap((section) =>
    section.questions.map((question) => question.id),
  );
  const total = weightFields.reduce(
    (sum, [key]) => sum + (values.weights[key] || 0),
    0,
  );
  const issues = validation.data?.issues ?? [];
  const publishIssues = isApiError(publish.error)
    ? Object.entries(publish.error.fieldErrors).map(([path, message]) => ({
        path,
        message,
      }))
    : [];

  return (
    <Tabs defaultValue="edit" className="grid gap-6">
      <div className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview as institution</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {save.isPending
              ? 'Saving…'
              : dirty
                ? 'Unsaved changes'
                : `Saved ${formatDateTime(form.updatedAt)}`}
          </span>
          <Button
            variant="outline"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            <Save aria-hidden="true" />
            Save draft
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={dirty || publish.isPending || issues.length > 0}
              >
                Publish version {form.version}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Publish version {form.version}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The published version is immutable. Institutions report on it
                  for the assigned periods, and existing responses are not
                  migrated.
                  {!form.weightsLocked &&
                    ' Publishing also locks the scoring weights for the whole cycle.'}
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
        </div>
      </div>

      {save.isError && (
        <Alert variant="destructive">
          <AlertTitle>The form was not saved</AlertTitle>
          <AlertDescription>
            {save.error.message} Your changes on this page are kept.
          </AlertDescription>
        </Alert>
      )}
      {publish.isError && (
        <Alert variant="destructive">
          <AlertTitle>Publication blocked</AlertTitle>
          <AlertDescription>
            <p>{publish.error.message}</p>
            <Issues issues={publishIssues} />
          </AlertDescription>
        </Alert>
      )}

      <TabsContent value="edit" className="grid gap-6">
        <section
          aria-labelledby="checks-heading"
          className="rounded-lg border bg-card p-5"
        >
          <h2 id="checks-heading" className="font-semibold">
            Publication checks
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Checked by the server against the last saved draft.
            {dirty && ' Save to re-check your changes.'}
          </p>
          {validation.data ? (
            <Issues issues={issues} />
          ) : (
            <p className="text-sm">Checking…</p>
          )}
        </section>

        <editor.Field name="title">
          {(field) => (
            <div id="edit-title" className="grid max-w-2xl gap-1.5">
              <Label htmlFor="form-title">Form title</Label>
              <Input
                id="form-title"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </editor.Field>

        <fieldset
          id="edit-weights"
          className="grid gap-3 rounded-lg border bg-card p-5"
        >
          <legend className="px-1 font-semibold">
            Scoring weights (Hackathon Mock v1)
          </legend>
          {form.weightsLocked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" aria-hidden="true" />
              Locked for this cycle since the first publication. A different
              weighting needs an approved profile change, not a form edit.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Must total 100. Locked for the whole cycle once the first version
              is published.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            {weightFields.map(([key, label]) => (
              <editor.Field key={key} name={`weights.${key}`}>
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`weight-${key}`}>{label}</Label>
                    <Input
                      id={`weight-${key}`}
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      disabled={form.weightsLocked}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(Number(event.target.value) || 0)
                      }
                    />
                  </div>
                )}
              </editor.Field>
            ))}
          </div>
          <p
            className={
              total === 100 ? 'text-sm' : 'text-sm font-medium text-destructive'
            }
            aria-live="polite"
          >
            Total: {total}
          </p>
        </fieldset>

        <editor.Field name="periodIds">
          {(field) => (
            <fieldset
              id="edit-periods"
              className="grid gap-3 rounded-lg border bg-card p-5"
            >
              <legend className="px-1 font-semibold">
                Periods using this version
              </legend>
              <p className="text-sm text-muted-foreground">
                Periods that have started reporting keep the version they
                started on.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {cycle.data?.periods.map((period) => (
                  <div key={period.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`period-${period.id}`}
                      checked={field.state.value.includes(period.id)}
                      onCheckedChange={(checked) =>
                        field.handleChange(
                          checked === true
                            ? [...field.state.value, period.id]
                            : field.state.value.filter(
                                (id) => id !== period.id,
                              ),
                        )
                      }
                    />
                    <Label
                      htmlFor={`period-${period.id}`}
                      className="font-normal"
                    >
                      {period.label}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </editor.Field>

        {values.sections.map((section, sectionIndex) => (
          <section
            key={section.id}
            id={`edit-s${sectionIndex}`}
            aria-label={`Section ${sectionIndex + 1}`}
            className="grid scroll-mt-24 gap-4 rounded-lg border bg-card p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-semibold">
                Section {sectionIndex + 1}{' '}
                <span className="font-mono text-xs font-normal text-muted-foreground">
                  {section.id}
                </span>
              </h2>
              {!section.questions.some(
                (question) => question.type === 'milestone_progress',
              ) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void editor.removeFieldValue('sections', sectionIndex)
                  }
                >
                  <Trash2 aria-hidden="true" />
                  Remove section
                </Button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <editor.Field name={`sections[${sectionIndex}].title`}>
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`s${sectionIndex}-title`}>
                      Section title
                    </Label>
                    <Input
                      id={`s${sectionIndex}-title`}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                  </div>
                )}
              </editor.Field>
              <editor.Field name={`sections[${sectionIndex}].description`}>
                {(field) => (
                  <div className="grid gap-1.5">
                    <Label htmlFor={`s${sectionIndex}-description`}>
                      Description (optional)
                    </Label>
                    <Textarea
                      id={`s${sectionIndex}-description`}
                      value={field.state.value ?? ''}
                      onChange={(event) =>
                        field.handleChange(event.target.value || undefined)
                      }
                    />
                  </div>
                )}
              </editor.Field>
            </div>
            <ol className="grid gap-3">
              {section.questions.map((question, questionIndex) => (
                <QuestionEditor
                  key={question.id}
                  editor={editor}
                  question={question}
                  sectionIndex={sectionIndex}
                  questionIndex={questionIndex}
                  count={section.questions.length}
                />
              ))}
            </ol>
            <AddQuestion
              onAdd={(type) =>
                void editor.pushFieldValue(
                  `sections[${sectionIndex}].questions`,
                  {
                    id: nextId('question', allQuestionIds),
                    label: '',
                    type,
                    required: true,
                    kind: 'informational',
                    ...(type === 'evidence'
                      ? { evidenceCategory: 'other' as const }
                      : {}),
                    ...(type === 'choice' ? { choices: ['', ''] } : {}),
                  },
                )
              }
            />
          </section>
        ))}
        <div>
          <Button
            variant="outline"
            onClick={() =>
              void editor.pushFieldValue('sections', {
                id: nextId(
                  'section',
                  values.sections.map((section) => section.id),
                ),
                title: '',
                questions: [],
              })
            }
          >
            <Plus aria-hidden="true" />
            Add section
          </Button>
        </div>
      </TabsContent>
      <TabsContent value="preview">
        <Preview form={{ ...form, ...values }} />
      </TabsContent>
    </Tabs>
  );
}

// The editor type is derived from a hook so field names and values stay checked.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- exists only to derive the form's type
function useEditorFormType(defaults: FormDraftUpdate) {
  return useForm({ defaultValues: defaults });
}
type Editor = ReturnType<typeof useEditorFormType>;

function AddQuestion({ onAdd }: { onAdd: (type: QuestionType) => void }) {
  const [type, setType] = useState<QuestionType>('text');
  const selectId = useId();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <Label htmlFor={selectId} className="text-sm">
          New question type
        </Label>
        <select
          id={selectId}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={type}
          onChange={(event) => setType(event.target.value as QuestionType)}
        >
          {addableTypes.map((option) => (
            <option key={option} value={option}>
              {typeLabels[option]}
            </option>
          ))}
        </select>
      </div>
      <Button variant="outline" size="sm" onClick={() => onAdd(type)}>
        <Plus aria-hidden="true" />
        Add question
      </Button>
    </div>
  );
}

function QuestionEditor({
  editor,
  question,
  sectionIndex,
  questionIndex,
  count,
}: {
  editor: Editor;
  question: Question;
  sectionIndex: number;
  questionIndex: number;
  count: number;
}) {
  const base = `sections[${sectionIndex}].questions[${questionIndex}]` as const;
  const domId = `edit-s${sectionIndex}-q${questionIndex}`;
  const scored = question.type === 'milestone_progress';
  return (
    <li
      id={domId}
      className="grid scroll-mt-24 gap-3 rounded-md border bg-background p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{typeLabels[question.type]}</span>{' '}
          <span className="text-muted-foreground">
            ·{' '}
            {scored
              ? 'Scored: implementation milestones from each locked baseline'
              : 'Informational: never changes a score'}{' '}
            ·{' '}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {question.id}
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={questionIndex === 0}
            onClick={() =>
              void editor.moveFieldValues(
                `sections[${sectionIndex}].questions`,
                questionIndex,
                questionIndex - 1,
              )
            }
          >
            <ArrowUp aria-hidden="true" />
            <span className="sr-only">Move up</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={questionIndex === count - 1}
            onClick={() =>
              void editor.moveFieldValues(
                `sections[${sectionIndex}].questions`,
                questionIndex,
                questionIndex + 1,
              )
            }
          >
            <ArrowDown aria-hidden="true" />
            <span className="sr-only">Move down</span>
          </Button>
          {!scored && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                void editor.removeFieldValue(
                  `sections[${sectionIndex}].questions`,
                  questionIndex,
                )
              }
            >
              <Trash2 aria-hidden="true" />
              <span className="sr-only">Remove question</span>
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <editor.Field name={`${base}.label`}>
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={`${domId}-label`}>Question label</Label>
              <Input
                id={`${domId}-label`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </editor.Field>
        <editor.Field name={`${base}.help`}>
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={`${domId}-help`}>Help text (optional)</Label>
              <Input
                id={`${domId}-help`}
                value={field.state.value ?? ''}
                onChange={(event) =>
                  field.handleChange(event.target.value || undefined)
                }
              />
            </div>
          )}
        </editor.Field>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {!scored && (
          <editor.Field name={`${base}.required`}>
            {(field) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${domId}-required`}
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                />
                <Label htmlFor={`${domId}-required`} className="font-normal">
                  Required
                </Label>
              </div>
            )}
          </editor.Field>
        )}
        {question.type === 'evidence' && (
          <editor.Field name={`${base}.evidenceCategory`}>
            {(field) => (
              <div className="grid gap-1.5">
                <Label htmlFor={`${domId}-category`}>Evidence category</Label>
                <select
                  id={`${domId}-category`}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={field.state.value ?? 'other'}
                  onChange={(event) =>
                    field.handleChange(
                      event.target.value as NonNullable<
                        Question['evidenceCategory']
                      >,
                    )
                  }
                >
                  {Object.entries(evidenceCategoryLabel).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}
          </editor.Field>
        )}
      </div>
      {question.type === 'choice' && (
        <editor.Field name={`${base}.choices`}>
          {(field) => (
            <div className="grid gap-1.5">
              <Label htmlFor={`${domId}-choices`}>Options, one per line</Label>
              <Textarea
                id={`${domId}-choices`}
                value={(field.state.value ?? []).join('\n')}
                onChange={(event) =>
                  field.handleChange(event.target.value.split('\n'))
                }
              />
            </div>
          )}
        </editor.Field>
      )}
    </li>
  );
}

function PublishedView({ form }: { form: FormVersion }) {
  return (
    <div className="grid gap-6">
      <Alert>
        <Lock aria-hidden="true" />
        <AlertTitle>
          Published {form.publishedAt ? formatDateTime(form.publishedAt) : ''};
          this version is locked
        </AlertTitle>
        <AlertDescription>
          To change wording or add informational questions for future periods,
          create a new version from the forms list.
        </AlertDescription>
      </Alert>
      <Preview form={form} />
    </div>
  );
}

export function FormEditorPage() {
  const { formId } = route.useParams();
  const form = useQuery(formQuery(formId));
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          form.data
            ? `Version ${form.data.version} · ${form.data.status === 'draft' ? 'draft' : 'published'}`
            : 'Form'
        }
        title={form.data?.title ?? 'Reporting form'}
        actions={
          <Link
            to="/admin/forms"
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft aria-hidden="true" />
            All versions
          </Link>
        }
      />
      <QueryView query={form} label="form">
        {(data) =>
          data.status === 'draft' ? (
            <DraftEditor key={data.id} form={data} />
          ) : (
            <PublishedView form={data} />
          )
        }
      </QueryView>
    </div>
  );
}
