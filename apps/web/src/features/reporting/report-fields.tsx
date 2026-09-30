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
import { FileText, MessageCircleQuestion, Upload } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
        <p className="text-sm text-base-dark">No rows yet.</p>
      )}
      <ol className="grid gap-3">
        {value.map((row, index) => (
          <li
            key={index}
            aria-label={`Row ${index + 1}`}
            className="grid gap-3 rounded-lg border-2 border-base-lighter bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">Row {index + 1}</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange(value.filter((_, position) => position !== index))
                }
              >
                Remove row {index + 1}
              </Button>
            </div>
            <div className="grid gap-3 tablet:grid-cols-2">
              {columns.map((column) => {
                const cellId = `${id}-r${index}-${column.id}`;
                const cell = row[column.id] ?? null;
                const problem =
                  cell !== null && String(cell).trim() !== ''
                    ? limitProblem(column.limits, column.type, cell)
                    : null;
                const label = (
                  <span id={`${cellId}-label`} className="text-sm">
                    {column.label}
                    {!column.required && (
                      <span className="ml-1 font-normal text-base-dark">
                        (optional)
                      </span>
                    )}
                  </span>
                );
                if (column.type === 'yes_no')
                  return (
                    <div key={column.id} className="grid gap-2">
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
                    <div key={column.id} className="grid gap-2">
                      {label}
                      <RadioGroup
                        aria-labelledby={`${cellId}-label`}
                        value={String(cell ?? '')}
                        onValueChange={(next) => set(index, column.id, next)}
                        className="flex flex-wrap gap-2"
                      >
                        {(column.choices ?? []).map((choice, choiceIndex) => (
                          <RadioTile
                            key={choice}
                            id={`${cellId}-${choiceIndex}`}
                            value={choice}
                            label={choice}
                            disabled={disabled}
                          />
                        ))}
                      </RadioGroup>
                    </div>
                  );
                return (
                  <div key={column.id} className="grid gap-2">
                    <Label htmlFor={cellId}>
                      {column.label}
                      {!column.required && (
                        <span className="ml-1 font-normal text-base-dark">
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
                        className="text-sm font-bold text-error-dark"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.length >= most}
          onClick={() => onChange([...value, empty()])}
        >
          Add a row
        </Button>
        <p className="mt-1 text-xs text-base-dark">
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
        <div className="font-bold">
          {label}
          {required === false && (
            <span className="ml-2 text-sm font-normal text-base-dark">
              (optional)
            </span>
          )}
        </div>
        {help && (
          <p
            id={`${id}-hint`}
            className="mt-1 max-w-measure text-xs text-base-dark"
          >
            {help}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** USWDS tile radio (usa-radio__input--tile): the bordered tile is the label and the target. */
function RadioTile({
  id,
  value,
  label,
  disabled,
}: {
  id: string;
  value: string;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className="min-h-touch cursor-pointer gap-3 rounded-md border-2 border-base-lighter bg-white px-4 py-2 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary-lighter has-disabled:cursor-not-allowed"
    >
      <RadioGroupItem value={value} id={id} disabled={disabled} />
      {label}
    </Label>
  );
}

function YesNo({
  id,
  value,
  onChange,
  labelledBy,
  yes = 'Yes',
  no = 'No',
  describedBy,
}: {
  describedBy?: string;
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
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
    >
      <RadioTile id={`${id}-yes`} value="yes" label={yes} />
      <RadioTile id={`${id}-no`} value="no" label={no} />
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
    <div className="grid max-w-tablet gap-3 bg-base-lightest p-4">
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
        <div className="grid gap-2">
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
    <div className="grid gap-2">
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
              ? 'min-h-touch cursor-pointer gap-2 rounded-md px-3 font-bold text-primary underline underline-offset-2 peer-focus:outline-4 peer-focus:outline-focus peer-disabled:cursor-not-allowed peer-disabled:text-disabled hover:text-primary-dark'
              : 'min-h-touch cursor-pointer gap-2 rounded-md bg-white px-4 font-bold text-primary shadow-[inset_0_0_0_2px_var(--color-primary)] peer-focus:outline-4 peer-focus:outline-focus peer-disabled:cursor-not-allowed peer-disabled:bg-disabled-lighter peer-disabled:text-disabled-dark peer-disabled:shadow-none hover:text-primary-dark'
          }
        >
          <Upload className="size-5" aria-hidden="true" />
          {label}
        </Label>
        {!replaces && (
          <span className="text-xs text-base-dark">
            PDF, DOCX, XLSX, JPEG or PNG · up to 20 MB
          </span>
        )}
      </div>
      {status.state === 'uploading' && (
        <div className="grid max-w-mobile-lg gap-1">
          <progress
            className="h-3 w-full accent-primary"
            value={status.progress}
            max={1}
            aria-label={`Uploading ${status.name}`}
          />
          <p aria-live="polite" className="text-xs text-base-dark">
            Uploading {status.name}… {Math.round(status.progress * 100)}%
          </p>
        </div>
      )}
      {status.state === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-l-4 border-error-dark pl-4 text-sm font-bold text-error-dark"
        >
          {status.message}
          <button
            type="button"
            className="min-h-touch font-normal text-primary underline underline-offset-2"
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
      <FileText className="size-4 shrink-0 text-base-dark" aria-hidden="true" />
      <span className="min-w-0">
        <FileViewer file={item} className="block max-w-full truncate" />
        <span className="block text-xs text-base-dark">
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
  const hintId = question.help ? `${id}-hint` : undefined;
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
                className="min-h-40"
                aria-labelledby={labelId}
                aria-describedby={hintId}
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
                  aria-describedby={
                    [hintId, problem && `${id}-problem`]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  aria-invalid={problem ? true : undefined}
                  type={question.type === 'text' ? 'text' : question.type}
                  value={String(value ?? '')}
                  disabled={disabled}
                  {...inputLimits(question)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="max-w-mobile-lg"
                />
                {question.limits?.unit && (
                  <span className="text-sm text-base-dark">
                    {question.limits.unit}
                  </span>
                )}
                {problem && (
                  <p
                    id={`${id}-problem`}
                    className="basis-full text-sm font-bold text-error-dark"
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
                      className="grid gap-2 rounded-md border bg-white p-3 tablet:grid-cols-[1fr_auto] tablet:items-center"
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
                describedBy={hintId}
                value={typeof value === 'boolean' ? value : null}
                onChange={(next) => field.handleChange(next)}
              />,
            );
          case 'choice':
            return shell(
              <RadioGroup
                aria-labelledby={labelId}
                aria-describedby={hintId}
                value={String(value ?? '')}
                onValueChange={(next) => field.handleChange(next)}
                className="grid max-w-tablet gap-2"
              >
                {(question.choices ?? []).map((choice, index) => (
                  <RadioTile
                    key={choice}
                    id={`${id}-${index}`}
                    value={choice}
                    label={choice}
                    disabled={disabled}
                  />
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
                        className="flex flex-wrap items-center gap-3 rounded-md border-2 border-base-lighter bg-white px-4 py-2"
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
                        <Label
                          htmlFor={`${id}-${item.id}`}
                          className="min-w-0 font-normal"
                        >
                          <EvidenceFile item={item} />
                        </Label>
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
        <div id={id} className="grid scroll-mt-28 gap-2">
          <Label htmlFor={`${id}-input`}>{label}</Label>
          {help && (
            <p
              id={`${id}-hint`}
              className="max-w-measure text-xs text-base-dark"
            >
              {help}
            </p>
          )}
          <Textarea
            className="min-h-40"
            id={`${id}-input`}
            aria-describedby={help ? `${id}-hint` : undefined}
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
            <legend className="font-bold">Supporting evidence</legend>
            <p className="text-sm text-base-dark">
              Expected: {milestone.evidenceExpectation} Select the files that
              support this claim and say where.
            </p>
            {current.length === 0 ? (
              <p className="text-sm text-base-dark">
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
                      className="grid gap-2 rounded-md border-2 border-base-lighter bg-white px-4 py-2"
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
                        <div className="grid gap-1 pl-8">
                          <Label
                            htmlFor={`${checkboxId}-passage`}
                            className="text-sm"
                          >
                            Page or section in {item.fileName}
                          </Label>
                          <Input
                            id={`${checkboxId}-passage`}
                            className="max-w-mobile-lg"
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
        'grid scroll-mt-28 gap-4 rounded-lg border-2 border-base-lighter bg-white p-4 tablet:p-6',
        questions.length > 0 && 'border-l-8 border-l-warning',
      )}
    >
      {questions.length > 0 && (
        <div className="grid gap-2 border-l-8 border-warning bg-warning-lighter px-5 py-4 text-sm text-ink">
          <p className="flex items-center gap-2 font-bold">
            <MessageCircleQuestion
              className="size-5 shrink-0"
              aria-hidden="true"
            />
            Your officer asked about this milestone
          </p>
          {questions.map((question) => (
            <div key={question.question}>
              <p>{question.question}</p>
              {question.requestedEvidence && (
                <p className="text-xs text-base-darker">
                  Requested: {question.requestedEvidence}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <header>
        <p className="text-xs font-bold tracking-wide text-base-dark uppercase">
          {milestone.code}
          {milestone.mandatory ? ' · Committee obligation' : ''}
        </p>
        <h3
          id={`${completedId}-title`}
          className="mt-1 text-md leading-tight font-bold"
        >
          {milestone.title}
        </h3>
        <dl className="mt-2 grid gap-1 text-sm tablet:grid-cols-[auto_1fr] tablet:gap-x-3">
          <dt className="text-base-dark">Activity</dt>
          <dd>{milestone.activity}</dd>
          <dt className="text-base-dark">Completion condition</dt>
          <dd>{milestone.completionCondition}</dd>
        </dl>
      </header>
      <form.Field name={completedName}>
        {(field) => (
          <div id={completedId} className="grid scroll-mt-28 gap-2">
            <p id={`${completedId}-label`} className="font-bold">
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
