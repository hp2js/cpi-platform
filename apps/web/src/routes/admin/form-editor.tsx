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
import { profilesQuery } from '@/features/settings/queries';
import { isApiError } from '@/lib/api';
import { weightSummary } from '@/features/settings/labels';
import { formatDateTime } from '@/lib/dates';
import { SelectField } from '@/components/select-field';
import { questionTypeLabels } from '@/features/forms/labels';

const route = getRouteApi('/authed/admin/forms/$formId');

const typeLabels = questionTypeLabels;
const addableTypes = (Object.keys(typeLabels) as QuestionType[]).filter(
  (type) => type !== 'milestone_progress',
);

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
  if (path.startsWith('weights') || path === 'profile') return 'edit-profile';
  if (path.startsWith('periodIds')) return 'edit-periods';
  return 'edit-title';
}

function issueLocation(path: string) {
  const match = /^sections\.(\d+)(?:\.questions\.(\d+))?/.exec(path);
  if (match)
    return match[2]
      ? `Section ${Number(match[1]) + 1}, question ${Number(match[2]) + 1}`
      : `Section ${Number(match[1]) + 1}`;
  if (path.startsWith('weights') || path === 'profile')
    return 'Scoring profile';
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
            <h2 className="text-lg font-bold">
              {section.title || 'Untitled section'}
            </h2>
            {section.description && (
              <p className="mt-1 text-sm text-base-dark">
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
              <div key={question.id} className="rounded-lg border bg-white p-4">
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

/** Weights come from the cycle's scoring profile (PRD §7.1); they are set in Settings. */
function CycleProfile() {
  const profiles = useQuery(profilesQuery);
  const profile = profiles.data?.profiles.find(
    (candidate) => candidate.id === profiles.data?.cycleProfileId,
  );
  return (
    <section
      id="edit-profile"
      aria-labelledby="profile-heading"
      className="grid gap-2 rounded-lg border bg-white p-5"
    >
      <h2 id="profile-heading" className="font-bold">
        Scoring profile
      </h2>
      {profile ? (
        <>
          <p>
            <Link
              to="/admin/profiles/$profileId"
              params={{ profileId: profile.id }}
              className="font-bold text-primary underline-offset-4 hover:underline"
            >
              {profile.name}
            </Link>
            <span className="text-sm text-base-dark">
              {' '}
              · {weightSummary(profile)}
            </span>
          </p>
          <p className="flex items-start gap-2 text-sm text-base-dark">
            {profiles.data?.locked && (
              <Lock className="mt-1 size-4 shrink-0" aria-hidden="true" />
            )}
            {profiles.data?.lockedReason ??
              'Weights and checklists come from the cycle’s profile, not the form. Choose or change it in Scoring profiles before the first version is published.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-base-dark">Loading the profile…</p>
      )}
    </section>
  );
}

function Issues({ issues }: { issues: FormIssue[] }) {
  if (issues.length === 0)
    return <p className="text-sm">No issues: this version can be published.</p>;
  return (
    <ul className="grid gap-2 text-sm">
      {issues.map((issue) => (
        <li key={`${issue.path}-${issue.message}`}>
          <a
            href={`#${issueAnchor(issue.path)}`}
            className="font-bold text-primary underline-offset-4 hover:underline"
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
  const issues = validation.data?.issues ?? [];
  const publishIssues = isApiError(publish.error)
    ? Object.entries(publish.error.fieldErrors).map(([path, message]) => ({
        path,
        message,
      }))
    : [];

  return (
    <Tabs defaultValue="edit" className="grid gap-6">
      <div
        data-sticky
        className="z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-base-lighter bg-white px-4 py-3 tablet:sticky tablet:top-(--sticky-top) desktop:-mx-8 desktop:px-8"
      >
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview as institution</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-base-dark" aria-live="polite">
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
                    ' Publishing also locks the cycle’s scoring profile for the whole cycle.'}
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
          className="rounded-lg border bg-white p-5"
        >
          <h2 id="checks-heading" className="font-bold">
            Publication checks
          </h2>
          <p className="mb-3 text-sm text-base-dark">
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
            <div id="edit-title" className="grid max-w-measure gap-2">
              <Label htmlFor="form-title">Form title</Label>
              <Input
                id="form-title"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </editor.Field>

        <CycleProfile />

        <editor.Field name="periodIds">
          {(field) => (
            <fieldset
              id="edit-periods"
              className="grid gap-3 rounded-lg border bg-white p-5"
            >
              <legend className="px-1 font-bold">
                Periods using this version
              </legend>
              <p className="text-sm text-base-dark">
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
            className="grid scroll-mt-24 gap-4 rounded-lg border bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-bold">
                Section {sectionIndex + 1}{' '}
                <span className="font-mono text-xs font-normal text-base-dark">
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
            <div className="grid gap-3 tablet:grid-cols-2">
              <editor.Field name={`sections[${sectionIndex}].title`}>
                {(field) => (
                  <div className="grid gap-2">
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
                  <div className="grid gap-2">
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
      <div className="grid gap-2">
        <Label htmlFor={selectId} className="text-sm">
          New question type
        </Label>
        <SelectField
          className="w-48"
          id={selectId}
          value={type}
          onChange={(value) => setType(value as QuestionType)}
          options={addableTypes.map((option) => ({
            value: option,
            label: typeLabels[option],
          }))}
        />
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
      className="grid scroll-mt-24 gap-3 rounded-md border bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-bold">{typeLabels[question.type]}</span>{' '}
          <span className="text-base-dark">
            ·{' '}
            {scored
              ? 'Scored: implementation milestones from each locked baseline'
              : 'Informational: never changes a score'}{' '}
            ·{' '}
          </span>
          <span className="font-mono text-xs text-base-dark">
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
      <div className="grid gap-3 tablet:grid-cols-2">
        <editor.Field name={`${base}.label`}>
          {(field) => (
            <div className="grid gap-2">
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
            <div className="grid gap-2">
              <Label htmlFor={`${domId}-help`}>Help text (optional)</Label>
              <Textarea
                id={`${domId}-help`}
                rows={2}
                className="min-h-0"
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
              <div className="grid gap-2">
                <Label htmlFor={`${domId}-category`}>Evidence category</Label>
                <SelectField
                  className="w-48"
                  id={`${domId}-category`}
                  value={field.state.value ?? 'other'}
                  onChange={(value) =>
                    field.handleChange(
                      value as NonNullable<Question['evidenceCategory']>,
                    )
                  }
                  options={Object.entries(evidenceCategoryLabel).map(
                    ([value, label]) => ({ value, label }),
                  )}
                />
              </div>
            )}
          </editor.Field>
        )}
      </div>
      {question.type === 'choice' && (
        <editor.Field name={`${base}.choices`}>
          {(field) => (
            <div className="grid gap-2">
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
