import { z } from 'zod';
import { dayCountingModeSchema } from './cycle.js';
import { institutionIdSchema, instantSchema } from './common.js';

export const institutionSchema = z.object({
  id: institutionIdSchema,
  name: z.string(),
  type: z.string(),
  active: z.boolean(),
});
export type Institution = z.infer<typeof institutionSchema>;
export const institutionsSchema = z.array(institutionSchema);

/** Workflow state of an institution-quarter obligation (PRD §7.5). */
export const workflowStateSchema = z.enum([
  'not_started',
  'draft',
  'submitted',
  'under_review',
  'clarification_requested',
  'finalized',
  'closed_without_submission',
]);
export type WorkflowState = z.infer<typeof workflowStateSchema>;

/** Flags are independent of workflow state: a late report can be under review (PRD §7.5). */
export const obligationFlagSchema = z.enum([
  'not_yet_due',
  'late',
  'evidence_incomplete',
  'clarification_overdue',
  'needs_re_review',
]);
export type ObligationFlag = z.infer<typeof obligationFlagSchema>;

export const obligationSchema = z.object({
  id: z.string(),
  institutionId: institutionIdSchema,
  periodId: z.string(),
  state: workflowStateSchema,
  flags: z.array(obligationFlagSchema),
  currentRevision: z.number().int().positive().nullable(),
  firstSubmittedAt: instantSchema.nullable(),
  /**
   * The first revision with every required document supplied (no evidence declared
   * unavailable). Kept apart from first submission so an early, empty response cannot hide a
   * late completion (PRD §7.2).
   */
  firstCompleteEvidenceAt: instantSchema.nullable(),
  /** Calendar days (Africa/Nairobi) the first submission came after the deadline; 0 on time. */
  daysLate: z.number().int().nonnegative().nullable(),
  daysLateUnit: dayCountingModeSchema,
  lastReceiptAt: instantSchema.nullable(),
});
export type Obligation = z.infer<typeof obligationSchema>;
export const obligationsSchema = z.array(obligationSchema);

export const assignmentSchema = z.object({
  institutionId: institutionIdSchema,
  officerId: z.string(),
  officerName: z.string(),
  validFrom: instantSchema,
  validTo: instantSchema.nullable(),
});
export type Assignment = z.infer<typeof assignmentSchema>;
export const assignmentsSchema = z.array(assignmentSchema);
