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

/** A mitigation activity from the institution's plan, linked to the risk it treats (FR04). */
export const activitySchema = z.object({
  id: z.string(),
  code: z.string(),
  riskId: z.string(),
  title: z.string(),
  strategy: z.string(),
  output: z.string(),
  kpi: z.string(),
  target: z.string(),
  owner: z.string(),
  resourceReference: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

/**
 * A milestone the institution plans for a quarter. Proposing a quarter's baseline copies the
 * quarter's planned milestones, with the two committee meetings added, into a new version.
 */
export const plannedMilestoneSchema = z.object({
  id: z.string(),
  code: z.string(),
  activityId: z.string(),
  periodId: z.string(),
  title: z.string(),
  completionCondition: z.string(),
  evidenceExpectation: z.string(),
});
export type PlannedMilestone = z.infer<typeof plannedMilestoneSchema>;

/** Who approved the institution's mitigation plan, and when (PRD §10.4). */
export const planApprovalSchema = z.object({
  approvingBody: z.string(),
  approvedOn: calendarDateSchema,
  reference: z.string(),
  accountingOfficer: z.string(),
  /** The mitigation plan foundation version the approval covers, when recorded. */
  documentVersionId: z.string().nullable(),
  recordedBy: z.string(),
  recordedAt: instantSchema,
});
export type PlanApproval = z.infer<typeof planApprovalSchema>;

export const baselineChecksSchema = z.object({
  materialCoverage: z.boolean(),
  objectiveConditions: z.boolean(),
  mandatoryObligations: z.boolean(),
  noFragmentation: z.boolean(),
});
export type BaselineChecks = z.infer<typeof baselineChecksSchema>;
export const baselineCheckSchema = baselineChecksSchema.keyof();
export type BaselineCheck = z.infer<typeof baselineCheckSchema>;

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
    .object({
      by: z.string(),
      at: instantSchema,
      reason: z.string(),
      /** The approval checks the officer found not met. */
      failedChecks: z.array(baselineCheckSchema),
    })
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

/** Where each quarter's baseline stands, and when the institution should propose it. */
export const baselineProposalSchema = z.object({
  periodId: z.string(),
  periodLabel: z.string(),
  /** Proposals are due this many days before the quarter starts (the calendar's lead days). */
  dueAt: instantSchema,
  startsAt: instantSchema,
  status: z.enum(['not_proposed', 'proposed', 'returned', 'approved']),
  /** Reporting has opened, so the quarter's baseline can no longer be proposed or revised. */
  locked: z.boolean(),
  /** The quarter's planned milestones differ from the latest baseline version. */
  changedSinceProposal: z.boolean(),
  plannedMilestones: z.number().int().nonnegative(),
});
export type BaselineProposal = z.infer<typeof baselineProposalSchema>;

export const planSchema = z.object({
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  /** A one-line summary of the approval record, or a note that none is recorded yet. */
  approvedPlanReference: z.string(),
  approval: planApprovalSchema.nullable(),
  risks: z.array(riskSchema),
  activities: z.array(activitySchema),
  plannedMilestones: z.array(plannedMilestoneSchema),
  proposals: z.array(baselineProposalSchema),
  baselines: z.array(baselineSchema),
  amendments: z.array(amendmentSchema),
  /** Whether the signed-in user may edit the plan and propose baselines. */
  editable: z.boolean(),
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
  failedChecks: z.array(baselineCheckSchema).min(1),
});

const text = (max: number) => z.string().trim().min(2).max(max);
const planCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,3}-\d{2,3}$/, 'Use a code such as R-01.');

export const riskRequestSchema = z.object({
  code: planCodeSchema,
  description: text(300),
  cause: text(500),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
});
export type RiskRequest = z.infer<typeof riskRequestSchema>;

export const activityRequestSchema = z.object({
  code: planCodeSchema,
  riskId: z.string().min(1),
  title: text(300),
  strategy: text(500),
  output: text(300),
  kpi: text(300),
  target: text(200),
  owner: text(200),
  resourceReference: z.string().trim().max(200),
});
export type ActivityRequest = z.infer<typeof activityRequestSchema>;

export const plannedMilestoneRequestSchema = z.object({
  code: planCodeSchema,
  activityId: z.string().min(1),
  periodId: z.string().min(1),
  title: text(300),
  completionCondition: z.string().trim().min(10).max(500),
  evidenceExpectation: text(300),
});
export type PlannedMilestoneRequest = z.infer<
  typeof plannedMilestoneRequestSchema
>;

export const planApprovalRequestSchema = z.object({
  approvingBody: text(200),
  approvedOn: calendarDateSchema,
  reference: text(300),
  accountingOfficer: text(200),
  documentVersionId: z.string().nullable(),
});
export type PlanApprovalRequest = z.infer<typeof planApprovalRequestSchema>;

/** Sends the quarter's planned milestones, with the committee meetings, for approval. */
export const proposeBaselineRequestSchema = z.object({
  note: z.string().trim().max(1000),
});

/** One CSV holds risks, activities and milestones, told apart by the `record` column. */
export const planImportColumns = [
  'record',
  'code',
  'link',
  'quarter',
  'title',
  'cause',
  'probability',
  'impact',
  'strategy',
  'output',
  'kpi',
  'target',
  'owner',
  'resource',
  'completion_condition',
  'evidence_expectation',
] as const;
export const planImportRequestSchema = z.object({
  csv: z.string().min(1).max(1_000_000),
});
export const planImportPreviewSchema = z.object({
  fileErrors: z.array(z.string()),
  rows: z.array(
    z.object({
      line: z.number().int().positive(),
      record: z.string(),
      code: z.string(),
      title: z.string(),
      action: z.enum(['add', 'update']),
      errors: z.array(z.string()),
    }),
  ),
  valid: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
});
export type PlanImportPreview = z.infer<typeof planImportPreviewSchema>;
export const planImportResultSchema = z.object({
  risks: z.number().int().nonnegative(),
  activities: z.number().int().nonnegative(),
  milestones: z.number().int().nonnegative(),
});
export type PlanImportResult = z.infer<typeof planImportResultSchema>;
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
