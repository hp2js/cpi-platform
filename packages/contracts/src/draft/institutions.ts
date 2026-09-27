import { z } from 'zod';
import { dayCountingModeSchema } from './cycle.js';
import { institutionIdSchema, instantSchema } from './common.js';

const fictionalEmail = z
  .string()
  .trim()
  .regex(
    /^[^@\s]+@example\.invalid$/,
    'Use a fictional @example.invalid address.',
  );

/**
 * The institution's Accounting Officer (PRD §3.1, §12.1). A contact on the institution, not a
 * platform account: the Accounting Officer chairs the CPC, and their approval reaches the
 * platform as a reference on each submission (§7.2); no approver role exists in P0.
 */
export const accountingOfficerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Give the Accounting Officer’s name.')
    .max(120),
  /** Their title in the institution, e.g. Director General or Chief Executive Officer. */
  designation: z.string().trim().min(2, 'Give their designation.').max(120),
  email: fictionalEmail.or(z.literal('')),
  phone: z.string().trim().max(40),
});
export type AccountingOfficer = z.infer<typeof accountingOfficerSchema>;

export const institutionSchema = z.object({
  id: institutionIdSchema,
  name: z.string(),
  /** Managed list (Settings → Institution types); `type` is its current label. */
  typeId: z.string(),
  type: z.string(),
  active: z.boolean(),
  accountingOfficer: accountingOfficerSchema.nullable(),
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
