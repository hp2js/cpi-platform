import { z } from 'zod';
import { instantSchema, roleSchema } from './common.js';

export const notificationSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  title: z.string(),
  /** Minimal summary: never evidence content or unreleased scores (FR11). */
  body: z.string(),
  /** An in-app path; the target screen still enforces access. */
  link: z.string().nullable(),
  createdAt: instantSchema,
  readAt: instantSchema.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
export const inboxSchema = z.object({
  unread: z.number().int().nonnegative(),
  items: z.array(notificationSchema),
});
export type Inbox = z.infer<typeof inboxSchema>;

/** One email delivery attempt series; unique per event, recipient and channel. */
export const deliverySchema = z.object({
  id: z.string(),
  eventType: z.string(),
  recipientName: z.string(),
  recipientEmail: z.string(),
  subject: z.string(),
  status: z.enum(['queued', 'delivered', 'retrying', 'failed']),
  attempts: z.number().int().nonnegative(),
  lastAttemptAt: instantSchema.nullable(),
  lastError: z.string().nullable(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const deliveriesSchema = z.array(deliverySchema);

export const auditEventSchema = z.object({
  id: z.string(),
  actorName: z.string(),
  actorRole: roleSchema,
  action: z.string(),
  objectType: z.string(),
  objectId: z.string(),
  objectVersion: z.string().nullable(),
  summary: z.string(),
  /** Simulated business time, alongside the actual time of the action. */
  businessTime: instantSchema,
  actualTime: instantSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditEventsSchema = z.array(auditEventSchema);

/**
 * Elevated actions: administrator overrides, support access, evidence opened by an
 * administrator, clock changes, publication and corrections. The audit log can filter to them.
 */
export const elevatedAuditActions = [
  'review.override',
  'support.draft_view',
  // Recorded only when an administrator opens a file.
  'evidence.access',
  'simulation.advance',
  'simulation.reset',
  'publication.publish',
  'publication.correct',
  'correction.open',
  'user.role_change',
] as const;

/** One page of the audit log, filtered on the server so it scales with the institution count. */
export const auditPageSchema = z.object({
  events: auditEventsSchema,
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** Every action and actor recorded, for the filter lists. */
  actions: z.array(z.string()),
  actors: z.array(z.string()),
});
export type AuditPage = z.infer<typeof auditPageSchema>;
