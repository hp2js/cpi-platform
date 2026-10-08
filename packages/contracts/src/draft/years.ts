import { z } from 'zod';
import { calendarDateSchema, instantSchema } from './common.js';
import { periodSchema } from './cycle.js';

/**
 * Financial years (HP2-100, PRD §7.1, FR02). Exactly one year is active; the administrator plans
 * the next one ahead, and planning never changes the active year.
 */
export const financialYearStatusSchema = z.enum([
  'planned',
  'active',
  'closed',
]);
export type FinancialYearStatus = z.infer<typeof financialYearStatusSchema>;

export const financialYearSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: financialYearStatusSchema,
  timezone: z.string(),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema,
  /** Procedures, risk assessment and mitigation plan; separate from quarterly deadlines. */
  foundationDeadline: instantSchema,
  evaluationCutoff: instantSchema,
  profileId: z.string(),
  profileName: z.string(),
  periods: z.array(periodSchema).length(4),
  /** Optimistic-concurrency token for a planned year's edits; a stale save is refused with 409. */
  revision: z.number().int().nonnegative(),
  /** Who planned it and when; null for the year the platform was set up with. */
  plannedBy: z.string().nullable(),
  plannedAt: instantSchema.nullable(),
});
export type FinancialYear = z.infer<typeof financialYearSchema>;

/** A year as the administrator enters it: dates only; times are the end of each local day. */
export const financialYearInputSchema = z.object({
  label: z.string().trim().min(4).max(40),
  /** The first day of the year; the four quarters follow, three months each. */
  startsOn: calendarDateSchema,
  /** Each quarter's submission deadline date, Q1 to Q4. */
  deadlines: z.array(calendarDateSchema).length(4),
  foundationDeadlineDate: calendarDateSchema,
  evaluationCutoffDate: calendarDateSchema,
  profileId: z.string().min(1),
});
export type FinancialYearInput = z.infer<typeof financialYearInputSchema>;

const reasonSchema = z
  .string()
  .trim()
  .min(10, 'Give a reason of at least 10 characters.')
  .max(500);

export const financialYearCreateSchema = financialYearInputSchema.extend({
  reason: reasonSchema,
});
export type FinancialYearCreate = z.infer<typeof financialYearCreateSchema>;

export const financialYearUpdateSchema = financialYearCreateSchema.extend({
  baseRevision: z.number().int().nonnegative(),
});
export type FinancialYearUpdate = z.infer<typeof financialYearUpdateSchema>;

export const financialYearDiscardSchema = z.object({ reason: reasonSchema });
export type FinancialYearDiscard = z.infer<typeof financialYearDiscardSchema>;

export const financialYearChangeSchema = z.object({
  at: instantSchema,
  by: z.string(),
  yearId: z.string(),
  summary: z.string(),
  reason: z.string(),
});
export type FinancialYearChange = z.infer<typeof financialYearChangeSchema>;

export const financialYearsSchema = z.object({
  /** Oldest first. */
  years: z.array(financialYearSchema),
  /** The next year under the current rules, to start from; null while one is already planned. */
  proposal: financialYearInputSchema.nullable(),
  /** Approved scoring profiles a year can use. */
  profiles: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Newest first. */
  changes: z.array(financialYearChangeSchema),
});
export type FinancialYears = z.infer<typeof financialYearsSchema>;
