import { z } from 'zod';
import { institutionIdSchema, instantSchema } from './common.js';
import { obligationFlagSchema, workflowStateSchema } from './institutions.js';
import { formVersionSchema } from './forms.js';
import { clarificationSchema } from './clarifications.js';
import {
  evidenceItemSchema,
  milestoneSchema,
  receiptSchema,
  reportAnswersSchema,
} from './reporting.js';

/** Exact fraction; values are never rounded before display (PRD §10.5). */
export const fractionSchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().positive(),
});
export type Fraction = z.infer<typeof fractionSchema>;

/** A score component is either calculated or explicitly pending with a reason; never a silent zero. */
export const componentScoreSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('calculated'),
    fraction: fractionSchema,
    maxPoints: z.number(),
    /** Points to two decimals, half-up, computed from the exact fraction. */
    points: z.string(),
  }),
  z.object({
    status: z.literal('pending'),
    maxPoints: z.number(),
    reason: z.enum([
      'baseline_not_approved',
      'awaiting_officer_decisions',
      'foundation_not_reviewed',
    ]),
  }),
]);
export type ComponentScore = z.infer<typeof componentScoreSchema>;

export const milestoneCreditSchema = z.object({
  milestoneId: z.string(),
  credit: z.boolean(),
  basis: z.enum([
    'claimed_with_evidence',
    'claimed_evidence_unavailable',
    'claimed_without_evidence',
    'not_claimed',
  ]),
});

export const scoreSummarySchema = z.object({
  profileName: z.string(),
  simulation: z.boolean(),
  provisional: componentScoreSchema,
  provisionalCredits: z.array(milestoneCreditSchema),
  reviewed: componentScoreSchema,
});
export type ScoreSummary = z.infer<typeof scoreSummarySchema>;

export const decisionSchema = z.object({
  id: z.string(),
  milestoneId: z.string(),
  outcome: z.enum(['accepted', 'rejected']),
  reason: z.string(),
  /** The submission revision this decision assessed. */
  revision: z.number().int().positive(),
  decidedBy: z.string(),
  decidedAt: instantSchema,
  /** Set when an unchanged decision was explicitly confirmed against a newer revision (§7.3). */
  carriedForwardFrom: z.string().nullable(),
  /** Decisions are append-only; a replaced or reopened decision keeps its record. */
  supersededAt: instantSchema.nullable(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const decisionRequestSchema = z.object({
  outcome: z.enum(['accepted', 'rejected']),
  reason: z.string().max(2000),
  revision: z.number().int().positive(),
});
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;

export const finalizeRequestSchema = z.object({
  revision: z.number().int().positive(),
});

export const reviewQueueItemSchema = z.object({
  submissionId: z.string(),
  obligationId: z.string(),
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  periodId: z.string(),
  periodLabel: z.string(),
  revision: z.number().int().positive(),
  state: workflowStateSchema,
  flags: z.array(obligationFlagSchema),
  /** From the current revision's receipt: how long this revision has waited. */
  receivedAt: instantSchema,
  /** From the first submission: total case age, unaffected by later revisions. */
  firstSubmittedAt: instantSchema,
  decisionsRecorded: z.number().int().nonnegative(),
  decisionsRequired: z.number().int().nonnegative(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export const reviewQueueSchema = z.array(reviewQueueItemSchema);

export const reviewBundleSchema = z.object({
  submissionId: z.string(),
  item: reviewQueueItemSchema,
  receipt: receiptSchema,
  form: formVersionSchema,
  milestones: z.array(milestoneSchema),
  answers: reportAnswersSchema,
  evidence: z.array(evidenceItemSchema),
  decisions: z.array(decisionSchema),
  score: scoreSummarySchema,
  finalizedAt: instantSchema.nullable(),
  finalizedBy: z.string().nullable(),
  /** Whether the caller may record decisions (assigned officer only; supervisors read). */
  canDecide: z.boolean(),
  /** Every decision version for this obligation, including superseded ones. */
  history: z.array(decisionSchema),
  /** The previous revision's decisions and whether each milestone's dependencies changed. */
  prior: z
    .object({
      revision: z.number().int().positive(),
      decisions: z.array(decisionSchema),
      changes: z.record(z.string(), z.enum(['changed', 'unchanged'])),
    })
    .nullable(),
  revisions: z.array(
    z.object({
      revision: z.number().int().positive(),
      submissionId: z.string(),
      receiptId: z.string(),
      receivedAt: instantSchema,
    }),
  ),
  clarifications: z.array(clarificationSchema),
  reopenings: z.array(
    z.object({ reason: z.string(), by: z.string(), at: instantSchema }),
  ),
});
export type ReviewBundle = z.infer<typeof reviewBundleSchema>;
