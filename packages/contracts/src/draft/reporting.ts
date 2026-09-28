import { z } from 'zod';
import { institutionIdSchema, instantSchema } from './common.js';
import { dayCountingModeSchema, periodSchema } from './cycle.js';
import { evidenceCategorySchema, formVersionSchema } from './forms.js';
import { obligationSchema } from './institutions.js';
import { clarificationSchema } from './clarifications.js';

/** A locked, objectively reviewable unit of planned work (PRD §10.4). */
export const milestoneSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  activity: z.string(),
  risk: z.string(),
  completionCondition: z.string(),
  evidenceExpectation: z.string(),
  weight: z.number().int().positive(),
  mandatory: z.boolean(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const evidenceItemSchema = z.object({
  id: z.string(),
  category: evidenceCategorySchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  uploadedAt: instantSchema,
  uploadedBy: z.string(),
  /** A replaced document becomes a new version with a new hash (FR06). */
  version: z.number().int().positive(),
  predecessorId: z.string().nullable(),
  supersededBy: z.string().nullable(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/** A claim's supporting reference: which file, and where in it. */
export const evidenceReferenceSchema = z.object({
  evidenceId: z.string(),
  passage: z.string().max(200),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

/** An honest declaration that evidence does not exist; submittable, never a technical error. */
export const unavailableDeclarationSchema = z.object({
  explanation: z.string().max(1000),
});

export const milestoneResponseSchema = z.object({
  completed: z.boolean().nullable(),
  output: z.string().max(2000),
  emergingIssues: z.string().max(2000),
  actions: z.string().max(2000),
  evidence: z.array(evidenceReferenceSchema),
  evidenceUnavailable: unavailableDeclarationSchema.nullable(),
});
export type MilestoneResponse = z.infer<typeof milestoneResponseSchema>;

export const evidenceAnswerSchema = z.object({
  evidenceIds: z.array(z.string()),
  unavailable: unavailableDeclarationSchema.nullable(),
});
export type EvidenceAnswer = z.infer<typeof evidenceAnswerSchema>;

export const answerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  evidenceAnswerSchema,
]);
export type AnswerValue = z.infer<typeof answerValueSchema>;

export const reportAnswersSchema = z.object({
  questions: z.record(z.string(), answerValueSchema),
  milestones: z.record(z.string(), milestoneResponseSchema),
});
export type ReportAnswers = z.infer<typeof reportAnswersSchema>;

export const draftSchema = z.object({
  obligationId: z.string(),
  formVersionId: z.string(),
  answers: reportAnswersSchema,
  /** Optimistic-concurrency token; a save with a stale version is refused with 409. */
  version: z.number().int().nonnegative(),
  savedAt: instantSchema.nullable(),
});
export type Draft = z.infer<typeof draftSchema>;

export const saveDraftRequestSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  answers: reportAnswersSchema,
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

export const attestationSchema = z.object({
  /** The submitter confirms they are authorized to submit for the institution (PRD §7.2). */
  authorized: z.literal(true),
  submitterRole: z.string().min(2).max(200),
  approval: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('reference'),
      reference: z.string().min(2).max(300),
    }),
    z.object({
      kind: z.literal('not_available'),
      explanation: z.string().min(10).max(1000),
    }),
  ]),
});
export type Attestation = z.infer<typeof attestationSchema>;

export const submitRequestSchema = z.object({
  draftVersion: z.number().int().nonnegative(),
  attestation: attestationSchema,
});
export type SubmitRequest = z.infer<typeof submitRequestSchema>;

export const completenessItemSchema = z.object({
  field: z.string(),
  label: z.string(),
  message: z.string(),
});
export const completenessSchema = z.object({
  complete: z.boolean(),
  /** Unanswered required items: these block submission. */
  missing: z.array(completenessItemSchema),
  /** Honest declarations: these are submittable and shown for confirmation. */
  declarations: z.array(completenessItemSchema),
});
export type Completeness = z.infer<typeof completenessSchema>;

export const receiptSchema = z.object({
  id: z.string(),
  obligationId: z.string(),
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  periodId: z.string(),
  periodLabel: z.string(),
  revision: z.number().int().positive(),
  /** Simulated business time used for timeliness. */
  receivedAt: instantSchema,
  /** Actual server time, for audit. */
  recordedAt: instantSchema,
  deadline: instantSchema,
  timeliness: z.enum(['on_time', 'late']),
  /** Calendar days after the deadline; 0 when on time (§10.2). */
  daysLate: z.number().int().nonnegative(),
  /** The day-counting rule in force when the receipt was issued. */
  daysLateUnit: dayCountingModeSchema,
  /** True when every required document was supplied, none declared unavailable. */
  evidenceComplete: z.boolean(),
  submittedBy: z.string(),
  submitterRole: z.string(),
  approval: attestationSchema.shape.approval,
  evidence: z.array(evidenceItemSchema),
  declaredUnavailable: z.array(completenessItemSchema),
  /** Institutions see whether a calculation exists, never its value, before publication. */
  calculation: z.enum(['recorded', 'pending_baseline_approval']),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const receiptsSchema = z.array(receiptSchema);

/** Everything the institution report screens need for one obligation. */
export const reportBundleSchema = z.object({
  obligation: obligationSchema,
  period: periodSchema,
  form: formVersionSchema.nullable(),
  baseline: z.object({
    status: z.enum(['approved', 'pending_approval']),
    milestones: z.array(milestoneSchema),
  }),
  /** Open clarification requests this revision should answer. */
  clarifications: z.array(clarificationSchema),
  draft: draftSchema.nullable(),
  evidence: z.array(evidenceItemSchema),
  receipts: z.array(receiptSchema),
  /** Whether the institution may edit now (draft or not started, and not locked by submission). */
  editable: z.boolean(),
});
export type ReportBundle = z.infer<typeof reportBundleSchema>;
