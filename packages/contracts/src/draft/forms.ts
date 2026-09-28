import { z } from 'zod';
import { instantSchema } from './common.js';

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

export const questionSchema = z.object({
  /** Stable identifier; answers and decisions reference it across versions. */
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  label: z.string().min(1).max(300),
  help: z.string().max(1000).optional(),
  type: questionTypeSchema,
  required: z.boolean(),
  /** Informational questions never change a score denominator (FR03). */
  kind: z.enum(['informational', 'scored']),
  choices: z.array(z.string().min(1)).optional(),
  evidenceCategory: evidenceCategorySchema.optional(),
});
export type Question = z.infer<typeof questionSchema>;

export const formSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  title: z.string().min(1).max(200),
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
});
export type FormVersion = z.infer<typeof formVersionSchema>;
export const formVersionsSchema = z.array(formVersionSchema);

export const formDraftUpdateSchema = formVersionSchema.pick({
  title: true,
  periodIds: true,
  sections: true,
  weights: true,
});
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
