import { z } from 'zod';
import {
  calendarDateSchema,
  institutionIdSchema,
  instantSchema,
} from './common.js';
import { componentScoreSchema } from './review.js';
import { evidenceItemSchema, milestoneSchema } from './reporting.js';

/** Probability and impact on the cycle's 1–5 scale; severity is their product. No bands are inferred (O16). */
export const riskSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string(),
  cause: z.string(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(25),
});
export type Risk = z.infer<typeof riskSchema>;

export const baselineChecksSchema = z.object({
  materialCoverage: z.boolean(),
  objectiveConditions: z.boolean(),
  mandatoryObligations: z.boolean(),
  noFragmentation: z.boolean(),
});
export type BaselineChecks = z.infer<typeof baselineChecksSchema>;

export const baselineSchema = z.object({
  id: z.string(),
  institutionId: institutionIdSchema,
  periodId: z.string(),
  periodLabel: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['proposed', 'approved', 'returned']),
  milestones: z.array(milestoneSchema),
  /** Simulation-only historical baseline (PRD §10.4): actual load time kept, never backdated. */
  historicalSeed: z
    .object({
      reason: z.string(),
      loadedAt: instantSchema,
      confirmedBy: z.string().nullable(),
      confirmedAt: instantSchema.nullable(),
    })
    .nullable(),
  approval: z
    .object({
      by: z.string(),
      at: instantSchema,
      rationale: z.string(),
      checks: baselineChecksSchema,
    })
    .nullable(),
  returned: z
    .object({ by: z.string(), at: instantSchema, reason: z.string() })
    .nullable(),
  /** Reporting has opened on this period, so the baseline can no longer change. */
  locked: z.boolean(),
});
export type Baseline = z.infer<typeof baselineSchema>;

export const amendmentSchema = z.object({
  id: z.string(),
  institutionId: institutionIdSchema,
  periodId: z.string(),
  milestoneId: z.string(),
  milestoneCode: z.string(),
  change: z.enum(['remove', 'reschedule']),
  toPeriodId: z.string().nullable(),
  reason: z.string(),
  status: z.enum(['pending', 'confirmed', 'declined']),
  requestedBy: z.string(),
  requestedAt: instantSchema,
  decidedBy: z.string().nullable(),
  decidedAt: instantSchema.nullable(),
  decisionReason: z.string().nullable(),
});
export type Amendment = z.infer<typeof amendmentSchema>;

export const planSchema = z.object({
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  approvedPlanReference: z.string(),
  risks: z.array(riskSchema),
  baselines: z.array(baselineSchema),
  amendments: z.array(amendmentSchema),
});
export type Plan = z.infer<typeof planSchema>;

export const approveBaselineRequestSchema = z.object({
  version: z.number().int().positive(),
  rationale: z.string().min(20).max(2000),
  checks: z.object({
    materialCoverage: z.literal(true),
    objectiveConditions: z.literal(true),
    mandatoryObligations: z.literal(true),
    noFragmentation: z.literal(true),
  }),
});
export const returnBaselineRequestSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().min(10).max(2000),
});
export const confirmSeedRequestSchema = z.object({
  version: z.number().int().positive(),
});

export const amendmentRequestSchema = z.object({
  periodId: z.string(),
  milestoneId: z.string(),
  change: z.enum(['remove', 'reschedule']),
  toPeriodId: z.string().nullable(),
  reason: z.string().min(10).max(2000),
});
export type AmendmentRequest = z.infer<typeof amendmentRequestSchema>;
export const amendmentDecisionSchema = z.object({
  decision: z.enum(['confirmed', 'declined']),
  reason: z.string().min(10).max(2000),
});

export const foundationKindSchema = z.enum([
  'procedures',
  'risk_assessment',
  'mitigation_plan',
]);
export type FoundationKind = z.infer<typeof foundationKindSchema>;

/** Four equally weighted checks per foundation indicator (PRD §10.3). */
export const foundationChecks: Record<
  FoundationKind,
  [string, string, string, string]
> = {
  procedures: [
    'Institutional identity and scope',
    'Prevention procedure content',
    'Approval details',
    'Designated implementation responsibility',
  ],
  risk_assessment: [
    'Coverage of core and support functions',
    'Identified risks and causes',
    'Probability and impact on the declared scale',
    'Existing controls and assessment context',
  ],
  mitigation_plan: [
    'Link to identified risks',
    'Strategies and activities',
    'Outputs and KPIs',
    'Responsibility, resources and timeframe',
  ],
};

export const foundationVersionSchema = z.object({
  id: z.string(),
  kind: foundationKindSchema,
  version: z.number().int().positive(),
  evidence: evidenceItemSchema,
  approvalReference: z.string(),
  effectiveFrom: calendarDateSchema,
  effectiveTo: calendarDateSchema.nullable(),
  status: z.enum(['active', 'superseded', 'withdrawn']),
  recordedAt: instantSchema,
  /** Which of the four checks the institution claims this document satisfies. */
  claimedChecks: z.array(z.boolean()).length(4),
  withdrawnReason: z.string().nullable(),
});
export type FoundationVersion = z.infer<typeof foundationVersionSchema>;

export const foundationCheckResultSchema = z.object({
  outcome: z.enum(['pass', 'fail']),
  passage: z.string().max(200),
  reason: z.string().max(2000),
});
export const foundationReviewSchema = z.object({
  versionId: z.string(),
  checks: z.array(foundationCheckResultSchema).length(4),
  reviewedBy: z.string(),
  reviewedAt: instantSchema,
});
export type FoundationReview = z.infer<typeof foundationReviewSchema>;
export const foundationReviewRequestSchema = foundationReviewSchema.pick({
  versionId: true,
  checks: true,
});
export type FoundationReviewRequest = z.infer<
  typeof foundationReviewRequestSchema
>;

export const foundationIndicatorSchema = z.object({
  kind: foundationKindSchema,
  label: z.string(),
  maxPoints: z.number(),
  /** The four checks from the cycle's scoring profile (PRD §10.3). */
  checks: z.array(z.string()).length(4),
  /** `prerequisite` under a profile that shows procedures without points. */
  mode: z.enum(['scored', 'prerequisite']),
  versions: z.array(foundationVersionSchema),
  review: foundationReviewSchema.nullable(),
  /** Internal only: omitted (null) for institution users before publication. */
  provisional: componentScoreSchema.nullable(),
  reviewed: componentScoreSchema.nullable(),
});
export type FoundationIndicator = z.infer<typeof foundationIndicatorSchema>;

export const foundationsSchema = z.object({
  institutionId: institutionIdSchema,
  deadline: instantSchema,
  indicators: z.array(foundationIndicatorSchema),
});
export type Foundations = z.infer<typeof foundationsSchema>;
