import { z } from 'zod';
import { calendarDateSchema, instantSchema } from './common.js';

/** Response types the constrained editor supports (FR03). No free-form executable rules. */
export const questionTypeSchema = z.enum([
  'text',
  'long_text',
  'number',
  'date',
  'yes_no',
  'choice',
  /** Upload or declare unavailable a document of the configured evidence category. */
  'evidence',
  /** A list of items, each answered done or not done. */
  'checklist',
  /** A table the institution adds rows to, such as trainings held, with configured columns. */
  'repeated',
  /** One row per locked baseline milestone due in the period; the scored implementation block. */
  'milestone_progress',
]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const evidenceCategorySchema = z.enum([
  'cpc_minutes',
  'iao_minutes',
  'procedures',
  'risk_assessment',
  'mitigation_plan',
  'other',
]);
export type EvidenceCategory = z.infer<typeof evidenceCategorySchema>;

const stableIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}$/);

/** Answer limits the institution sees and the completeness check enforces (FR03). */
export const answerLimitsSchema = z.object({
  /** Numbers: inclusive range, whole numbers only, and the unit shown beside the field. */
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  unit: z.string().trim().max(30).optional(),
  /** Text: the longest answer accepted. */
  maxLength: z.number().int().min(1).max(10_000).optional(),
  /** Dates: the inclusive range accepted. */
  earliest: calendarDateSchema.optional(),
  latest: calendarDateSchema.optional(),
});
export type AnswerLimits = z.infer<typeof answerLimitsSchema>;

// Labels may be blank in a saved draft; publication checks refuse them (FR03).
export const checklistItemSchema = z.object({
  id: stableIdSchema,
  label: z.string().max(300),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const columnTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'yes_no',
  'choice',
]);
export type ColumnType = z.infer<typeof columnTypeSchema>;
export const columnSchema = z.object({
  id: stableIdSchema,
  label: z.string().max(200),
  type: columnTypeSchema,
  required: z.boolean(),
  choices: z.array(z.string().max(200)).optional(),
  limits: answerLimitsSchema.optional(),
});
export type Column = z.infer<typeof columnSchema>;

export const questionSchema = z.object({
  /** Stable identifier; answers and decisions reference it across versions. */
  id: stableIdSchema,
  label: z.string().max(300),
  help: z.string().max(1000).optional(),
  type: questionTypeSchema,
  required: z.boolean(),
  /** Informational questions never change a score denominator (FR03). */
  kind: z.enum(['informational', 'scored']),
  choices: z.array(z.string().max(200)).optional(),
  evidenceCategory: evidenceCategorySchema.optional(),
  limits: answerLimitsSchema.optional(),
  /** Checklist questions: the items, each answered done or not done. */
  items: z.array(checklistItemSchema).optional(),
  /** Repeated rows: the columns of each row, and how many rows are expected. */
  columns: z.array(columnSchema).optional(),
  minRows: z.number().int().min(0).max(50).optional(),
  maxRows: z.number().int().min(1).max(50).optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const formSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  title: z.string().max(200),
  description: z.string().max(1000).optional(),
  questions: z.array(questionSchema),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export const indicatorWeightsSchema = z.object({
  procedures: z.number().int().min(0).max(100),
  riskAssessment: z.number().int().min(0).max(100),
  mitigationPlan: z.number().int().min(0).max(100),
  implementation: z.number().int().min(0).max(100),
});
export type IndicatorWeights = z.infer<typeof indicatorWeightsSchema>;

/** One difference from the version a draft was based on, in plain words (FR03, AT04). */
export const formChangeSchema = z.object({
  kind: z.enum(['added', 'removed', 'changed', 'periods']),
  target: z.enum(['question', 'section', 'form']),
  id: z.string(),
  label: z.string(),
  details: z.array(z.string()),
});
export type FormChange = z.infer<typeof formChangeSchema>;

export const formVersionSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  publishedAt: instantSchema.nullable(),
  /** Periods that report on this version. Open or past periods keep their assigned version. */
  periodIds: z.array(z.string()),
  sections: z.array(formSectionSchema),
  /** Scoring weights; locked for the whole cycle once the first version is published (PRD §7.1). */
  weights: indicatorWeightsSchema,
  weightsLocked: z.boolean(),
  basedOnVersion: z.number().int().positive().nullable(),
  updatedAt: instantSchema,
  /** Optimistic-concurrency token for draft saves; a stale save is refused with 409. */
  revision: z.number().int().nonnegative(),
  /** What differs from the version it was based on; empty for a first version. */
  changes: z.array(formChangeSchema),
});
export type FormVersion = z.infer<typeof formVersionSchema>;
export const formVersionsSchema = z.array(formVersionSchema);

export const formDraftUpdateSchema = formVersionSchema
  .pick({
    title: true,
    periodIds: true,
    sections: true,
    weights: true,
  })
  .extend({ baseRevision: z.number().int().nonnegative() });
export type FormDraftUpdate = z.infer<typeof formDraftUpdateSchema>;

/** A publication blocker with the path of the offending field, so the editor can point to it. */
export const formIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type FormIssue = z.infer<typeof formIssueSchema>;
export const formValidationSchema = z.object({
  valid: z.boolean(),
  issues: z.array(formIssueSchema),
});
export type FormValidation = z.infer<typeof formValidationSchema>;

/** Discarding an unpublished draft version needs a reason, kept in the audit log. */
export const formDiscardSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

/** The limits in words, for hints beside a field and for change summaries. */
export function describeLimits(limits: AnswerLimits | undefined) {
  if (!limits) return 'none';
  const parts: string[] = [];
  const unit = limits.unit ? ` ${limits.unit}` : '';
  if (limits.min !== undefined && limits.max !== undefined)
    parts.push(`${limits.min} to ${limits.max}${unit}`);
  else if (limits.min !== undefined)
    parts.push(`at least ${limits.min}${unit}`);
  else if (limits.max !== undefined) parts.push(`at most ${limits.max}${unit}`);
  else if (unit) parts.push(`in${unit}`);
  if (limits.integer) parts.push('whole numbers');
  if (limits.maxLength) parts.push(`up to ${limits.maxLength} characters`);
  if (limits.earliest && limits.latest)
    parts.push(`${limits.earliest} to ${limits.latest}`);
  else if (limits.earliest) parts.push(`from ${limits.earliest}`);
  else if (limits.latest) parts.push(`until ${limits.latest}`);
  return parts.join(', ') || 'none';
}

/** Why an answer breaks the question's limits, in words; null when it is acceptable. */
export function limitProblem(
  limits: AnswerLimits | undefined,
  type: string,
  value: unknown,
): string | null {
  if (!limits) return null;
  if (type === 'number') {
    const number = typeof value === 'number' ? value : Number(value);
    const unit = limits.unit ? ` ${limits.unit}` : '';
    if (!Number.isFinite(number)) return 'Enter a number.';
    if (limits.integer && !Number.isInteger(number))
      return 'Enter a whole number.';
    const below = limits.min !== undefined && number < limits.min;
    const above = limits.max !== undefined && number > limits.max;
    if (below || above)
      return limits.min !== undefined && limits.max !== undefined
        ? `Enter a number from ${limits.min} to ${limits.max}${unit}.`
        : below
          ? `Enter at least ${limits.min}${unit}.`
          : `Enter at most ${limits.max}${unit}.`;
  }
  if ((type === 'text' || type === 'long_text') && limits.maxLength) {
    const length = String(value).trim().length;
    if (length > limits.maxLength)
      return `Shorten this to ${limits.maxLength} characters (now ${length}).`;
  }
  if (type === 'date') {
    const date = String(value);
    if (limits.earliest && date < limits.earliest)
      return `Choose a date on or after ${limits.earliest}.`;
    if (limits.latest && date > limits.latest)
      return `Choose a date on or before ${limits.latest}.`;
  }
  return null;
}
