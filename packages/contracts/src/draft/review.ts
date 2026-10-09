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

/**
 * Evidence suitability (PRD §9.2, AT30): for every relied-on evidence version the officer
 * records five checks. A deficiency means the file cannot substantiate a claim; it is an
 * evidence finding, not an allegation of fraud.
 */
export const suitabilityCheckKeys = [
  'institution',
  'period',
  'relevance',
  'approval',
  'readability',
] as const;
export const suitabilityCheckLabels: Record<
  (typeof suitabilityCheckKeys)[number],
  string
> = {
  institution: 'Matches the institution',
  period: 'Matches the reporting or effective period',
  relevance: 'Relevant to the claims that cite it',
  approval: 'Required approval or signature present',
  readability: 'Readable',
};
const suitabilityCheckSchema = z.object({
  outcome: z.enum(['pass', 'deficient', 'not_applicable']),
  reason: z.string().max(1000),
});
export const suitabilityChecksSchema = z.object({
  institution: suitabilityCheckSchema,
  period: suitabilityCheckSchema,
  relevance: suitabilityCheckSchema,
  approval: suitabilityCheckSchema,
  readability: suitabilityCheckSchema,
});
export type SuitabilityChecks = z.infer<typeof suitabilityChecksSchema>;
export const evidenceSuitabilitySchema = z.object({
  evidenceId: z.string(),
  checks: suitabilityChecksSchema,
  /** True when any check is deficient: the file cannot substantiate a claim. */
  deficient: z.boolean(),
  recordedBy: z.string(),
  recordedAt: instantSchema,
});
export type EvidenceSuitability = z.infer<typeof evidenceSuitabilitySchema>;
export const suitabilityRequestSchema = z
  .object({
    revision: z.number().int().positive(),
    checks: suitabilityChecksSchema,
  })
  .superRefine((value, context) => {
    for (const key of suitabilityCheckKeys) {
      const check = value.checks[key];
      if (check.outcome !== 'pass' && check.reason.trim().length < 10)
        context.addIssue({
          code: 'custom',
          path: ['checks', key, 'reason'],
          message: 'Give a reason of at least 10 characters.',
        });
    }
  });

/**
 * Supervisor oversight comments (PRD §5.2, §7.3): visible to officers and administrators,
 * never to the institution, and never an approval step for the officer's decisions.
 */
export const oversightReplySchema = z.object({
  author: z.string(),
  role: z.enum(['officer', 'supervisor', 'administrator']),
  at: instantSchema,
  text: z.string(),
});
export const oversightCommentSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  author: z.string(),
  at: instantSchema,
  text: z.string(),
  /**
   * `addressed` once the officer says so. Closing the loop is for the supervisor's view only:
   * an open comment never blocks finalization.
   */
  status: z.enum(['open', 'addressed']),
  addressedAt: instantSchema.nullable(),
  replies: z.array(oversightReplySchema),
});
export type OversightComment = z.infer<typeof oversightCommentSchema>;
export const oversightCommentRequestSchema = z.object({
  text: z.string().trim().min(10).max(2000),
});
/** A reply in the comment's thread; the assigned officer may also mark it addressed. */
export const oversightReplyRequestSchema = z.object({
  text: z.string().trim().min(2).max(2000),
  addressed: z.boolean(),
});

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
  /** When this revision's review was finalized; null while it is open (HP2-48). */
  finalizedAt: instantSchema.nullable(),
  /**
   * Whose move it is on open work, since when, and for how many whole days: the officer from
   * receipt (or the latest reopening), the institution while a clarification is open. Null once
   * finalized, so completed work never shows a growing wait.
   */
  waiting: z
    .object({
      on: z.enum(['officer', 'institution']),
      since: instantSchema,
      days: z.number().int().nonnegative(),
    })
    .nullable(),
  /** Whole days from first submission: to now while open, fixed at finalization once done. */
  caseDays: z.number().int().nonnegative(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export const reviewQueueSchema = z.array(reviewQueueItemSchema);

/**
 * Whether a finalized review can be reopened now, and why not (PRD §7.4, HP2-51). After the
 * institution's annual result is published, only an administrator-opened correction case for
 * this quarter allows it; `correction` is that case, or the open case for another quarter.
 */
export const reopenEligibilitySchema = z.object({
  allowed: z.boolean(),
  reason: z.string().nullable(),
  published: z.boolean(),
  correction: z
    .object({
      periodId: z.string(),
      periodLabel: z.string(),
      reason: z.string(),
      openedBy: z.string(),
      openedAt: instantSchema,
    })
    .nullable(),
});
export type ReopenEligibility = z.infer<typeof reopenEligibilitySchema>;

export const reviewBundleSchema = z.object({
  submissionId: z.string(),
  item: reviewQueueItemSchema,
  receipt: receiptSchema,
  form: formVersionSchema,
  milestones: z.array(milestoneSchema),
  answers: reportAnswersSchema,
  evidence: z.array(evidenceItemSchema),
  /** Suitability records for this submission's files (AT30). */
  suitability: z.array(evidenceSuitabilitySchema),
  /** Supervisor oversight comments on this obligation, across revisions. */
  comments: z.array(oversightCommentSchema),
  decisions: z.array(decisionSchema),
  score: scoreSummarySchema,
  finalizedAt: instantSchema.nullable(),
  finalizedBy: z.string().nullable(),
  /** Whether the caller may record decisions (assigned officer only; supervisors read). */
  canDecide: z.boolean(),
  /** An administrator may act here only through a justified, logged override (FR10). */
  canOverride: z.boolean(),
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
  reopen: reopenEligibilitySchema,
});
export type ReviewBundle = z.infer<typeof reviewBundleSchema>;

/**
 * Basic evidence lookup (FR15): submitted files within the caller's scope, filtered by
 * institution, period, category and review state. There is no unrestricted document search.
 */
export const evidenceLookupItemSchema = z.object({
  evidence: evidenceItemSchema,
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  periodId: z.string(),
  periodLabel: z.string(),
  submissionId: z.string(),
  revision: z.number().int().positive(),
  reviewState: z.enum(['awaiting_review', 'finalized']),
  suitability: z.enum(['not_checked', 'suitable', 'deficient']),
  citedBy: z.array(z.string()),
});
export type EvidenceLookupItem = z.infer<typeof evidenceLookupItemSchema>;
export const evidenceLookupSchema = z.array(evidenceLookupItemSchema);
