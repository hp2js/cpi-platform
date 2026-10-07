import { z } from 'zod';
import {
  calendarDateSchema,
  institutionIdSchema,
  instantSchema,
} from './common.js';
import { assignmentCoverSchema } from './institutions.js';
import { fractionSchema } from './review.js';

/** A dashboard metric always carries its numerator, denominator and as-of time (PRD §4.3). */
export const metricSchema = z.object({
  id: z.string(),
  label: z.string(),
  definition: z.string(),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  /** Null when the denominator is zero: shown as "Not applicable", never 100%. */
  percent: z.number().nullable(),
});
export type Metric = z.infer<typeof metricSchema>;

export const oversightFiltersSchema = z.object({
  periodId: z.string().nullable(),
  institutionId: institutionIdSchema.nullable(),
  officerId: z.string().nullable(),
});
export type OversightFilters = z.infer<typeof oversightFiltersSchema>;

export const officerWorkloadSchema = z.object({
  officerId: z.string(),
  officerName: z.string(),
  institutions: z.number().int().nonnegative(),
  awaitingOfficer: z.number().int().nonnegative(),
  awaitingInstitution: z.number().int().nonnegative(),
  oldestReviewDays: z.number().int().nonnegative().nullable(),
  finalized: z.number().int().nonnegative(),
});

export const comparisonRowSchema = z.object({
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  periodLabel: z.string(),
  reviewed: fractionSchema,
  points: z.string(),
  planSize: z.number().int().positive(),
});

/**
 * One quarter of the trend series (PRD §4.1: coverage, trends and review backlog). Counts are
 * in the caller's scope; quarters not yet due report `due: 0` and are shown as not applicable.
 */
export const trendPointSchema = z.object({
  periodId: z.string(),
  periodLabel: z.string(),
  /**
   * Where the quarter stands (HP2-55): reporting not open yet (the quarter has not ended), open
   * until the submission deadline, or due. Rates need `due`, so they apply only once it is due.
   */
  status: z.enum(['not_open', 'open', 'due']),
  submissionDeadline: instantSchema,
  /** Reports expected for the quarter in the caller's scope, and how many are in already. */
  expected: z.number().int().nonnegative(),
  received: z.number().int().nonnegative(),
  /** Reports whose deadline has passed. */
  due: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  onTime: z.number().int().nonnegative(),
  finalized: z.number().int().nonnegative(),
  awaitingOfficer: z.number().int().nonnegative(),
  reviewOverdue: z.number().int().nonnegative(),
  /** Mean reviewed implementation points of finalized reports; null when none. */
  averagePoints: z.string().nullable(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const oversightSchema = z.object({
  asOf: instantSchema,
  profileName: z.string(),
  simulation: z.boolean(),
  filters: oversightFiltersSchema,
  metrics: z.array(metricSchema),
  backlog: z.object({
    awaitingOfficer: z.number().int().nonnegative(),
    awaitingInstitution: z.number().int().nonnegative(),
    closedNonresponse: z.number().int().nonnegative(),
  }),
  averageReviewed: z.object({
    points: z.string().nullable(),
    /** The profile's implementation weight, the maximum for one quarter's reviewed result. */
    maxPoints: z.number(),
    included: z.number().int().nonnegative(),
    expected: z.number().int().nonnegative(),
  }),
  workload: z.array(officerWorkloadSchema),
  comparison: z.array(comparisonRowSchema),
  trends: z.array(trendPointSchema),
  /** The officer review target the `review_overdue` flag uses. */
  reviewTarget: z.object({
    days: z.number().int().positive(),
    unit: z.enum(['calendar', 'working']),
  }),
});
export type Oversight = z.infer<typeof oversightSchema>;

export const assignmentChangeRequestSchema = z.object({
  institutionId: institutionIdSchema,
  officerId: z.string(),
  reason: z.string().min(10).max(1000),
  /** The reassignment request this change applies, if any. */
  suggestionId: z.string().optional(),
  /** Temporary cover: the institution returns to its current officer at the end of this date. */
  coverUntil: calendarDateSchema.optional(),
  /** Shown to the new officer on the institution's page and in their notification. */
  handoverNote: z.string().trim().max(2000).optional(),
});
export type AssignmentChangeRequest = z.infer<
  typeof assignmentChangeRequestSchema
>;
export const assignmentHistorySchema = z.array(
  z.object({
    institutionId: institutionIdSchema,
    officerId: z.string(),
    officerName: z.string(),
    validFrom: instantSchema,
    validTo: instantSchema.nullable(),
    reason: z.string().nullable(),
    cover: assignmentCoverSchema,
    handoverNote: z.string().nullable(),
  }),
);

/**
 * A request that an institution move to another officer: a supervisor's suggestion, or an
 * officer's conflict-of-interest declaration about their own institution. Only the
 * administrator changes assignments (PRD §5.2); applying or dismissing is recorded here.
 */
export const reassignmentSuggestionSchema = z.object({
  id: z.string(),
  kind: z.enum(['suggestion', 'conflict_of_interest']),
  requestedByRole: z.enum(['supervisor', 'officer']),
  institutionId: institutionIdSchema,
  institutionName: z.string(),
  currentOfficerId: z.string().nullable(),
  currentOfficerName: z.string().nullable(),
  suggestedOfficerId: z.string().nullable(),
  suggestedOfficerName: z.string().nullable(),
  reason: z.string(),
  suggestedBy: z.string(),
  at: instantSchema,
  status: z.enum(['open', 'applied', 'dismissed']),
  resolvedBy: z.string().nullable(),
  resolvedAt: instantSchema.nullable(),
  resolutionNote: z.string().nullable(),
});
export type ReassignmentSuggestion = z.infer<
  typeof reassignmentSuggestionSchema
>;
export const reassignmentSuggestionsSchema = z.array(
  reassignmentSuggestionSchema,
);
export const reassignmentSuggestionRequestSchema = z.object({
  /** Officers may only declare a conflict of interest about their own institution. */
  kind: z.enum(['suggestion', 'conflict_of_interest']).default('suggestion'),
  institutionId: institutionIdSchema,
  /** Null when the supervisor asks the administrator to choose. */
  suggestedOfficerId: z.string().nullable(),
  reason: z.string().trim().min(10).max(1000),
});
export type ReassignmentSuggestionRequest = z.infer<
  typeof reassignmentSuggestionRequestSchema
>;
export const suggestionDismissRequestSchema = z.object({
  note: z.string().trim().min(10).max(1000),
});
export type SuggestionDismissRequest = z.infer<
  typeof suggestionDismissRequestSchema
>;

/** Many institutions to one officer, each with its own history entry (500+ institutions). */
export const bulkAssignmentRequestSchema = z.object({
  institutionIds: z.array(institutionIdSchema).min(1).max(1000),
  officerId: z.string(),
  reason: z.string().trim().min(10).max(1000),
  handoverNote: z.string().trim().max(2000).optional(),
});
export type BulkAssignmentRequest = z.infer<typeof bulkAssignmentRequestSchema>;
export const bulkSupervisionRequestSchema = z.object({
  institutionIds: z.array(institutionIdSchema).min(1).max(1000),
  supervisorId: z.string(),
  reason: z.string().trim().min(10).max(1000),
});
export type BulkSupervisionRequest = z.infer<
  typeof bulkSupervisionRequestSchema
>;
export const bulkChangeResultSchema = z.object({
  changed: z.array(institutionIdSchema),
  /** Already with that officer or supervisor: nothing to change. */
  unchanged: z.array(institutionIdSchema),
});
