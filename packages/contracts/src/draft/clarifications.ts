import { z } from 'zod';
import { dayCountingModeSchema } from './cycle.js';
import { institutionIdSchema, instantSchema } from './common.js';

export const clarificationItemSchema = z.object({
  /** The criterion questioned; null for a question about the report as a whole. */
  milestoneId: z.string().nullable(),
  criterion: z.string(),
  question: z.string(),
  requestedEvidence: z.string(),
});
export type ClarificationItem = z.infer<typeof clarificationItemSchema>;

export const clarificationSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  obligationId: z.string(),
  institutionId: institutionIdSchema,
  periodId: z.string(),
  periodLabel: z.string(),
  /** The revision the questions are about. */
  revision: z.number().int().positive(),
  items: z.array(clarificationItemSchema).min(1),
  requestedBy: z.string(),
  requestedAt: instantSchema,
  /** The window runs from the later of portal availability and in-app notification (PRD §7.3). */
  availableAt: instantSchema,
  notifiedAt: instantSchema,
  responseDueAt: instantSchema,
  /** The window as issued; a later change to the day-counting rule never shortens it. */
  windowDays: z.number().int().positive(),
  windowUnit: dayCountingModeSchema,
  status: z.enum(['open', 'responded', 'closed_unanswered']),
  overdue: z.boolean(),
  /** The window ends after the evaluation cutoff: adverse closure is blocked until an authorized decision. */
  extensionRequired: z.boolean(),
  response: z
    .object({
      revision: z.number().int().positive(),
      submittedAt: instantSchema,
    })
    .nullable(),
  /** Set when the officer closed it unanswered after the window and the cutoff (§7.3). */
  closure: z
    .object({ reason: z.string(), by: z.string(), at: instantSchema })
    .nullable(),
});
export type Clarification = z.infer<typeof clarificationSchema>;

/** Closing an unanswered clarification after its window and the cutoff (PRD §7.3). */
export const closeClarificationRequestSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});
export const clarificationRequestSchema = z.object({
  revision: z.number().int().positive(),
  items: z
    .array(
      z.object({
        milestoneCode: z.string().nullable(),
        question: z.string().min(10).max(2000),
        requestedEvidence: z.string().max(1000),
      }),
    )
    .min(1),
});
export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>;

export const reopenRequestSchema = z.object({
  reason: z.string().min(10).max(2000),
});
