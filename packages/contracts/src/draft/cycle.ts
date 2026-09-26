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

export const cycleSchema = z.object({
  id: z.string(),
  label: z.string(),
  timezone: z.string(),
  /** Procedures, risk assessment and mitigation plan; separate from quarterly deadlines. */
  foundationDeadline: instantSchema,
  evaluationCutoff: instantSchema,
  periods: z.array(periodSchema).length(4),
});
export type Cycle = z.infer<typeof cycleSchema>;
