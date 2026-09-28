import { z } from 'zod';
import { calendarDateSchema, instantSchema } from './common.js';

export const periodSchema = z.object({
  id: z.string(),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  label: z.string(),
  startsOn: calendarDateSchema,
  endsOn: calendarDateSchema,
  /** Last on-time instant (23:59:59 local on the deadline date). */
  submissionDeadline: instantSchema,
});
export type Period = z.infer<typeof periodSchema>;

/**
 * How the cycle counts days (PRD §9.1 proposes calendar days; the administrator may enforce
 * working days instead). Working days are Monday to Friday, excluding the listed public
 * holidays, in Africa/Nairobi.
 */
export const dayCountingModeSchema = z.enum(['calendar', 'working']);
export type DayCountingMode = z.infer<typeof dayCountingModeSchema>;
export const holidaySchema = z.object({
  date: calendarDateSchema,
  name: z.string().trim().min(2).max(80),
});
export const dayCountingSchema = z.object({
  mode: dayCountingModeSchema,
  /** The deadline rule: this many days after each quarter ends (PRD §9.1: 15). */
  reportingDays: z.number().int().min(1).max(60),
  /** The clarification response window (PRD §7.3: 7). */
  clarificationDays: z.number().int().min(1).max(30),
  /**
   * Officer review target: counted days from receipt to a final decision. Past it, the quarter
   * is flagged `review_overdue` for supervisors. A target, never a gate (PRD §7.3).
   */
  reviewTargetDays: z.number().int().min(1).max(60),
  holidays: z.array(holidaySchema).max(60),
});
export type DayCounting = z.infer<typeof dayCountingSchema>;

export const cycleSchema = z.object({
  id: z.string(),
  label: z.string(),
  timezone: z.string(),
  /** Procedures, risk assessment and mitigation plan; separate from quarterly deadlines. */
  foundationDeadline: instantSchema,
  evaluationCutoff: instantSchema,
  periods: z.array(periodSchema).length(4),
  dayCounting: dayCountingSchema,
});
export type Cycle = z.infer<typeof cycleSchema>;
