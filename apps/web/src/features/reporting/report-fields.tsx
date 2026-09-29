import {
  describeLimits,
  isChecklistAnswer,
  isRowsAnswer,
  limitProblem,
  type ClarificationItem,
  type EvidenceAnswer,
  type EvidenceItem,
  type EvidenceReference,
  type Milestone,
  type Question,
  type ReportAnswers,
} from '@cpi/contracts';
import { useForm } from '@tanstack/react-form';
import { FileText, Upload } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { evidenceCategoryLabel, fieldDomId, formatBytes } from './answers';
import { FileViewer } from '@/features/files/file-viewer';

// The form type is derived from the hook so field names and values stay checked.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- exists only to derive the form's type
function useReportFormType(initial: ReportAnswers) {
  return useForm({ defaultValues: initial });
}
export type ReportForm = ReturnType<typeof useReportFormType>;

export type UploadFn = (
  file: File,
  category: string,
  onProgress: (fraction: number) => void,
  replaces?: string,
) => Promise<EvidenceItem>;

/**
 * TanStack Form cannot tell `milestones.<id>` from `milestones.<id>.output` when ids are record
 * keys, so it infers an impossible setter type for milestone sub-fields. Values read correctly;
 * this restores the setter's real type at the few places that need it.
 */
function setterOf<T>(field: { handleChange: unknown }) {
  return field.handleChange as (value: T) => void;
}

const ACCEPT = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png';

/** Browser hints matching the question's limits; the server check is the one that counts. */
function inputLimits(question: Pick<Question, 'type' | 'limits'>) {
  const limits = question.limits;
  if (!limits) return {};
  if (question.type === 'number')
    return {
      min: limits.min,
      max: limits.max,
      step: limits.integer ? 1 : 'any',
      inputMode: limits.integer ? ('numeric' as const) : ('decimal' as const),
    };
  if (question.type === 'date')
    return { min: limits.earliest, max: limits.latest };
  if (question.type === 'text' || question.type === 'long_text')
    return { maxLength: limits.maxLength };
  return {};
}

type Cell = string | number | boolean | null;

/** A table the institution adds rows to, with the configured columns (FR03). */
function RowsField({
  id,
  question,
  value,
  disabled,
  onChange,
}: {
  id: string;
  question: Question;
  value: Record<string, Cell>[];
  disabled?: boolean;
  onChange: (rows: Record<string, Cell>[]) => void;
}) {
  const columns = question.columns ?? [];
  const most = question.maxRows ?? 50;
  const empty = () =>
    Object.fromEntries(
      columns.map((column) => [
        column.id,
        column.type === 'yes_no' ? null : '',
      ]),
    ) as Record<string, Cell>;
  const set = (index: number, columnId: string, cell: Cell) =>
    onChange(
      value.map((row, position) =>
        position === index ? { ...row, [columnId]: cell } : row,
      ),
    );
  return (
    <div className="grid gap-3">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">No rows yet.</p>
      )}
      <ol className="grid gap-3">
        {value.map((row, index) => (
          <li
            key={index}
            aria-label={`Row ${index + 1}`}
            className="grid gap-3 rounded-md border bg-background p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Row {index + 1}</span>
              <button
                type="button"
                disabled={disabled}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                onClick={() =>
                  onChange(value.filter((_, position) => position !== index))
                }
              >
                Remove row {index + 1}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {columns.map((column) => {
                const cellId = `${id}-r${index}-${column.id}`;
                const cell = row[column.id] ?? null;
                const problem =
                  cell !== null && String(cell).trim() !== ''
                    ? limitProblem(column.limits, column.type, cell)
                    : null;
                const label = (
                  <span id={`${cellId}-label`} className="text-sm font-medium">
                    {column.label}
                    {!column.required && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        (optional)
                      </span>
                    )}
                  </span>
                );
                if (column.type === 'yes_no')
                  return (
                    <div key={column.id} className="grid gap-1.5">
                      {label}
                      <YesNo
                        id={cellId}
                        labelledBy={`${cellId}-label`}
                        value={typeof cell === 'boolean' ? cell : null}
                        onChange={(next) => set(index, column.id, next)}
                      />
                    </div>
                  );
                if (column.type === 'choice')
                  return (
                    <div key={column.id} className="grid gap-1.5">
                      {label}
                      <RadioGroup
                        aria-labelledby={`${cellId}-label`}
                        value={String(cell ?? '')}
                        onValueChange={(next) => set(index, column.id, next)}
                        className="flex flex-wrap gap-x-4 gap-y-1"
                      >
                        {(column.choices ?? []).map((choice, choiceIndex) => (
                          <div key={choice} className="flex items-center gap-2">
                            <RadioGroupItem
                              value={choice}
                              id={`${cellId}-${choiceIndex}`}
                              disabled={disabled}
                            />
                            <Label
                              htmlFor={`${cellId}-${choiceIndex}`}
                              className="font-normal"
                            >
                              {choice}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  );
                return (
                  <div key={column.id} className="grid gap-1.5">
                    <Label htmlFor={cellId} className="font-medium">
                      {column.label}
                      {!column.required && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          (optional)
                        </span>
                      )}
                    </Label>
                    <Input
                      id={cellId}
                      type={column.type}
                      value={String(cell ?? '')}
                      disabled={disabled}
                      aria-invalid={problem ? true : undefined}
                      aria-describedby={
                        problem ? `${cellId}-problem` : undefined
                      }
                      {...inputLimits(column)}
                      onChange={(event) =>
                        set(index, column.id, event.target.value)
                      }
                    />
                    {problem && (
                      <p
                        id={`${cellId}-problem`}
                        className="text-sm text-destructive"
                      >
                        {problem}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div>
        <button
          type="button"
          disabled={disabled || value.length >= most}
          onClick={() => onChange([...value, empty()])}
          className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent disabled:opacity-50"
        >
          Add a row
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          {question.minRows
            ? `At least ${question.minRows} ${question.minRows === 1 ? 'row' : 'rows'}, `
            : ''}
          up to {most}.
        </p>
      </div>
    </div>
  );
}

function FieldShell({
  id,
  label,
  help,
  children,
  required,
}: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-28 gap-2">
      <div>
        <div className="font-medium">
          {label}
          {required === false && (
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              (optional)
            </span>
          )}
        </div>
        {help && <p className="mt-0.5 text-sm text-muted-foreground">{help}</p>}
      </div>
      {children}
    </div>
  );
}

function YesNo({
  id,
  value,
  onChange,
  labelledBy,
  yes = 'Yes',
  no = 'No',
}: {
  id: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  labelledBy: string;
  yes?: string;
  no?: string;
}) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value === null ? '' : value ? 'yes' : 'no'}
      onValueChange={(next) => onChange(next === 'yes')}
      className="flex flex-wrap gap-x-6 gap-y-2"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id={`${id}-yes`} />
        <Label htmlFor={`${id}-yes`} className="font-normal">
          {yes}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id={`${id}-no`} />
        <Label htmlFor={`${id}-no`} className="font-normal">
          {no}
        </Label>
      </div>
    </RadioGroup>
  );
}

/** Honest "not available" declaration: submittable, and never disguised as an upload error (§7.2). */
function UnavailableDeclaration({
  id,
  value,
  onChange,
  prompt,
  disabled,
}: {
  id: string;
  value: { explanation: string } | null;
  onChange: (value: { explanation: string } | null) => void;
  prompt: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-unavailable`}
          checked={value !== null}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(checked === true ? { explanation: '' } : null)
          }
        />
        <Label htmlFor={`${id}-unavailable`} className="font-normal">
          {prompt}
        </Label>
      </div>
      {value !== null && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-explanation`}>Explain why</Label>
          <Textarea
            id={`${id}-explanation`}
            value={value.explanation}
            disabled={disabled}
            onChange={(event) => onChange({ explanation: event.target.value })}
            placeholder="For example: minutes are awaiting the chair's signature."
          />
        </div>
      )}
    </div>
  );
}

function UploadButton({
  category,
  upload,
  onUploaded,
  disabled,
  replaces,
  label = 'Upload a file',
}: {
  category: string;
  upload: UploadFn;
  onUploaded: (item: EvidenceItem) => void;
  disabled?: boolean;
  /** Evidence ID this upload replaces; the server records a new version. */
  replaces?: string;
  label?: string;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { state: 'idle' }
    | { state: 'uploading'; name: string; progress: number }
    | { state: 'error'; message: string; file: File }
  >({ state: 'idle' });

  async function send(file: File) {
    setStatus({ state: 'uploading', name: file.name, progress: 0 });
    try {
      // A retry of a completed upload returns the same record; it is never duplicated (FR06).
      const item = await upload(
        file,
        category,
        (progress) =>
          setStatus({ state: 'uploading', name: file.name, progress }),
        replaces,
      );
      onUploaded(item);
      setStatus({ state: 'idle' });
    } catch (error) {
      const message = isApiError(error)
        ? (error.fieldErrors.file ?? error.message)
        : error instanceof Error
          ? error.message
          : 'The upload failed. Check your connection and try again.';
      setStatus({ state: 'error', message, file });
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="peer sr-only"
          disabled={disabled || status.state === 'uploading'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <Label
          htmlFor={inputId}
          className={
            replaces
              ? 'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:bg-accent'
              : 'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:bg-accent'
          }
        >
          <Upload className="size-4" aria-hidden="true" />
          {label}
        </Label>
        {!replaces && (
          <span className="text-xs text-muted-foreground">
            PDF, DOCX, XLSX, JPEG or PNG · up to 20 MB
          </span>
        )}
      </div>
      {status.state === 'uploading' && (
        <div className="grid max-w-sm gap-1">
          <progress
            className="h-2 w-full accent-primary"
            value={status.progress}
            max={1}
            aria-label={`Uploading ${status.name}`}
          />
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Uploading {status.name}… {Math.round(status.progress * 100)}%
          </p>
        </div>
      )}
      {status.state === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
        >
          {status.message}
          <button
            type="button"
            className="underline"
            onClick={() => void send(status.file)}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function EvidenceFile({ item }: { item: EvidenceItem }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <FileText
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <FileViewer file={item} className="block max-w-full truncate" />
        <span className="block text-xs text-muted-foreground">
          {formatBytes(item.sizeBytes)} · uploaded{' '}
          {formatDateTime(item.uploadedAt)}
        </span>
      </span>
    </span>
  );
}

export function QuestionField({
  form,
  question,
  evidence,
  upload,
  disabled,
}: {
  form: ReportForm;
  question: Question;
  evidence: EvidenceItem[];
  upload: UploadFn;
  disabled?: boolean;
}) {
  const path = `questions.${question.id}` as const;
  const id = fieldDomId(path);
  const labelId = `${id}-label`;
  return (
    <form.Field name={path}>
      {(field) => {
        const value = field.state.value;
        const shell = (control: ReactNode) => (
          <FieldShell
            id={id}
            required={question.required}
            help={
              [
                question.help,
                question.limits &&
                  `Accepted: ${describeLimits(question.limits)}.`,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            label={<span id={labelId}>{question.label}</span>}
          >
            {control}
          </FieldShell>
        );
        switch (question.type) {
          case 'long_text':
            return shell(
              <Textarea
                aria-labelledby={labelId}
                {...inputLimits(question)}
                value={String(value ?? '')}
                disabled={disabled}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />,
            );
          case 'text':
          case 'number':
          case 'date': {
            const problem =
              field.state.meta.isBlurred && String(value ?? '').trim()
                ? limitProblem(question.limits, question.type, value)
                : null;
            return shell(
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-labelledby={labelId}
                  aria-describedby={problem ? `${id}-problem` : undefined}
                  aria-invalid={problem ? true : undefined}
                  type={question.type === 'text' ? 'text' : question.type}
                  value={String(value ?? '')}
                  disabled={disabled}
                  {...inputLimits(question)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="max-w-md"
                />
                {question.limits?.unit && (
                  <span className="text-sm text-muted-foreground">
                    {question.limits.unit}
                  </span>
                )}
                {problem && (
                  <p
                    id={`${id}-problem`}
                    className="basis-full text-sm text-destructive"
                  >
                    {problem}
                  </p>
                )}
              </div>,
            );
          }
          case 'checklist': {
            const answer = isChecklistAnswer(value) ? value : { items: {} };
            return shell(
              <ul className="grid gap-2">
                {(question.items ?? []).map((item) => {
                  const itemId = `${id}-${item.id}`;
                  return (
                    <li
                      key={item.id}
                      className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <span id={`${itemId}-label`}>{item.label}</span>
                      <YesNo
                        id={itemId}
                        labelledBy={`${itemId}-label`}
                        yes="Done"
                        no="Not done"
                        value={answer.items[item.id] ?? null}
                        onChange={(next) =>
                          field.handleChange({
                            items: { ...answer.items, [item.id]: next },
                          })
                        }
                      />
                    </li>
                  );
                })}
              </ul>,
            );
          }
          case 'repeated':
            return shell(
              <RowsField
                id={id}
                question={question}
                value={isRowsAnswer(value) ? value.rows : []}
                disabled={disabled}
                onChange={(rows) => field.handleChange({ rows })}
              />,
            );
          case 'yes_no':
            return shell(
              <YesNo
                id={id}
                labelledBy={labelId}
                value={typeof value === 'boolean' ? value : null}
                onChange={(next) => field.handleChange(next)}
              />,
            );
          case 'choice':
            return shell(
              <RadioGroup
                aria-labelledby={labelId}
                value={String(value ?? '')}
                onValueChange={(next) => field.handleChange(next)}
                className="grid gap-2"
              >
                {(question.choices ?? []).map((choice, index) => (
                  <div key={choice} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={choice}
                      id={`${id}-${index}`}
                      disabled={disabled}
                    />
                    <Label htmlFor={`${id}-${index}`} className="font-normal">
                      {choice}
                    </Label>
                  </div>
                ))}
              </RadioGroup>,
            );
          case 'evidence': {
            const answer = (value ?? {
              evidenceIds: [],
              unavailable: null,
            }) as EvidenceAnswer;
            // Only current versions are offered; replaced files stay in the record as history.
            const files = evidence.filter(
              (item) =>
                item.category === question.evidenceCategory &&
                !item.supersededBy,
            );
            const set = (next: Partial<EvidenceAnswer>) =>
              field.handleChange({ ...answer, ...next });
            return shell(
              <div className="grid gap-3">
                {files.length > 0 && (
                  <ul
                    className="grid gap-2"
                    aria-label={`Uploaded ${evidenceCategoryLabel[question.evidenceCategory ?? 'other']}`}
                  >
                    {files.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                      >
                        <Checkbox
                          id={`${id}-${item.id}`}
                          checked={answer.evidenceIds.includes(item.id)}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            set({
                              evidenceIds:
                                checked === true
                                  ? [...answer.evidenceIds, item.id]
                                  : answer.evidenceIds.filter(
                                      (existing) => existing !== item.id,
                                    ),
                            })
                          }
                          aria-label={`Include ${item.fileName} in this report`}
                        />
                        <EvidenceFile item={item} />
                        <div className="ml-auto">
                          <UploadButton
                            category={item.category}
                            upload={upload}
                            disabled={disabled}
                            replaces={item.id}
                            label="Replace"
                            // The editor swaps every reference to the replaced file.
                            onUploaded={() => undefined}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {!answer.unavailable && (
                  <UploadButton
                    category={question.evidenceCategory ?? 'other'}
                    upload={upload}
                    disabled={disabled}
                    onUploaded={(item) =>
                      set({
                        evidenceIds: [...answer.evidenceIds, item.id],
                        unavailable: null,
                      })
                    }
                  />
                )}
                <UnavailableDeclaration
                  id={id}
                  value={answer.unavailable}
                  disabled={disabled}
                  prompt="This document is not available for this quarter"
                  onChange={(unavailable) =>
                    set({
                      unavailable,
                      evidenceIds: unavailable ? [] : answer.evidenceIds,
                    })
                  }
                />
              </div>,
            );
          }
          case 'milestone_progress':
            return null;
        }
      }}
    </form.Field>
  );
}

function TextArea({
  form,
  name,
  label,
  help,
}: {
  form: ReportForm;
  name: `milestones.${string}.${'output' | 'emergingIssues' | 'actions'}`;
  label: string;
  help?: string;
}) {
  const id = fieldDomId(name);
  return (
    <form.Field name={name}>
      {(field) => (
        <div id={id} className="grid scroll-mt-28 gap-1.5">
          <Label htmlFor={`${id}-input`}>{label}</Label>
          {help && (
            <p className="-mt-1 text-sm text-muted-foreground">{help}</p>
          )}
          <Textarea
            id={`${id}-input`}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => setterOf<string>(field)(event.target.value)}
          />
        </div>
      )}
    </form.Field>
  );
}

function EvidenceReferences({
  form,
  milestone,
  evidence,
}: {
  form: ReportForm;
  milestone: Milestone;
  evidence: EvidenceItem[];
}) {
  const current = evidence.filter((item) => !item.supersededBy);
  const name = `milestones.${milestone.id}.evidence` as const;
  const id = fieldDomId(name);
  return (
    <form.Field name={name}>
      {(field) => {
        const references: EvidenceReference[] = field.state.value;
        const setReferences = setterOf<EvidenceReference[]>(field);
        const toggle = (evidenceId: string, on: boolean) =>
          setReferences(
            on
              ? [...references, { evidenceId, passage: '' }]
              : references.filter(
                  (reference) => reference.evidenceId !== evidenceId,
                ),
          );
        return (
          <fieldset id={id} className="grid scroll-mt-28 gap-2">
            <legend className="font-medium">Supporting evidence</legend>
            <p className="text-sm text-muted-foreground">
              Expected: {milestone.evidenceExpectation} Select the files that
              support this claim and say where.
            </p>
            {current.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Upload committee minutes above to reference them here.
              </p>
            ) : (
              <ul className="grid gap-2">
                {current.map((item) => {
                  const reference = references.find(
                    (candidate) => candidate.evidenceId === item.id,
                  );
                  const checkboxId = `${id}-${item.id}`;
                  return (
                    <li
                      key={item.id}
                      className="grid gap-2 rounded-md border bg-background p-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={checkboxId}
                          checked={Boolean(reference)}
                          onCheckedChange={(checked) =>
                            toggle(item.id, checked === true)
                          }
                        />
                        <Label
                          htmlFor={checkboxId}
                          className="min-w-0 font-normal"
                        >
                          <EvidenceFile item={item} />
                        </Label>
                      </div>
                      {reference && (
                        <div className="grid gap-1 pl-7">
                          <Label
                            htmlFor={`${checkboxId}-passage`}
                            className="text-sm"
                          >
                            Page or section in {item.fileName}
                          </Label>
                          <Input
                            id={`${checkboxId}-passage`}
                            className="max-w-sm"
                            value={reference.passage}
                            placeholder="e.g. Item 4, page 2"
                            onChange={(event) =>
                              setReferences(
                                references.map((candidate) =>
                                  candidate.evidenceId === item.id
                                    ? {
                                        ...candidate,
                                        passage: event.target.value,
                                      }
                                    : candidate,
                                ),
                              )
                            }
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        );
      }}
    </form.Field>
  );
}

export function MilestoneCard({
  form,
  milestone,
  evidence,
  questions = [],
}: {
  form: ReportForm;
  milestone: Milestone;
  evidence: EvidenceItem[];
  /** Open clarification questions about this milestone, shown where they apply. */
  questions?: ClarificationItem[];
}) {
  const completedName = `milestones.${milestone.id}.completed` as const;
  const completedId = fieldDomId(completedName);
  return (
    <article
      id={`milestone-${milestone.id}`}
      aria-labelledby={`${completedId}-title`}
      className={cn(
        'grid scroll-mt-28 gap-4 rounded-lg border bg-card p-4 sm:p-5',
        questions.length > 0 && 'border-amber-500/60 ring-1 ring-amber-500/30',
      )}
    >
      {questions.length > 0 && (
        <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-medium">Your officer asked about this milestone</p>
          {questions.map((question) => (
            <div key={question.question}>
              <p>{question.question}</p>
              {question.requestedEvidence && (
                <p className="text-xs">
                  Requested: {question.requestedEvidence}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <header>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {milestone.code}
          {milestone.mandatory ? ' · Committee obligation' : ''}
        </p>
        <h3 id={`${completedId}-title`} className="mt-0.5 font-semibold">
          {milestone.title}
        </h3>
        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="text-muted-foreground">Activity</dt>
          <dd>{milestone.activity}</dd>
          <dt className="text-muted-foreground">Completion condition</dt>
          <dd>{milestone.completionCondition}</dd>
        </dl>
      </header>
      <form.Field name={completedName}>
        {(field) => (
          <div id={completedId} className="grid scroll-mt-28 gap-2">
            <p id={`${completedId}-label`} className="font-medium">
              Was this milestone completed by the end of the quarter?
            </p>
            <YesNo
              id={completedId}
              labelledBy={`${completedId}-label`}
              value={field.state.value}
              onChange={(next) => setterOf<boolean>(field)(next)}
              yes="Yes, completed"
              no="No, not completed"
            />
          </div>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => state.values.milestones[milestone.id]?.completed}
      >
        {(completed) =>
          completed === true ? (
            <div className="grid gap-4">
              <TextArea
                form={form}
                name={`milestones.${milestone.id}.output`}
                label="Output achieved"
              />
              <EvidenceReferences
                form={form}
                milestone={milestone}
                evidence={evidence}
              />
              <form.Field
                name={`milestones.${milestone.id}.evidenceUnavailable`}
              >
                {(field) => (
                  <div
                    id={fieldDomId(
                      `milestones.${milestone.id}.evidenceUnavailable`,
                    )}
                    className="scroll-mt-28"
                  >
                    <UnavailableDeclaration
                      id={fieldDomId(
                        `milestones.${milestone.id}.evidenceUnavailable`,
                      )}
                      value={field.state.value}
                      onChange={(next) =>
                        setterOf<{ explanation: string } | null>(field)(next)
                      }
                      prompt="Supporting evidence is not available"
                    />
                  </div>
                )}
              </form.Field>
            </div>
          ) : completed === false ? (
            <div className="grid gap-4">
              <TextArea
                form={form}
                name={`milestones.${milestone.id}.emergingIssues`}
                label="Why was it not completed?"
                help="Reporting honest non-completion is expected and is not an error."
              />
              <TextArea
                form={form}
                name={`milestones.${milestone.id}.actions`}
                label="Actions to address this"
              />
            </div>
          ) : null
        }
      </form.Subscribe>
    </article>
  );
}
