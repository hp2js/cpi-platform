import { z } from 'zod';
import { institutionIdSchema, instantSchema } from './common.js';
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
    included: z.number().int().nonnegative(),
    expected: z.number().int().nonnegative(),
  }),
  workload: z.array(officerWorkloadSchema),
  comparison: z.array(comparisonRowSchema),
});
export type Oversight = z.infer<typeof oversightSchema>;

export const assignmentChangeRequestSchema = z.object({
  institutionId: institutionIdSchema,
  officerId: z.string(),
  reason: z.string().min(10).max(1000),
});
export const assignmentHistorySchema = z.array(
  z.object({
    institutionId: institutionIdSchema,
    officerId: z.string(),
    officerName: z.string(),
    validFrom: instantSchema,
    validTo: instantSchema.nullable(),
    reason: z.string().nullable(),
  }),
);
