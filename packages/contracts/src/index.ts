import { z } from 'zod';

export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  services: z.object({
    database: z.enum(['up', 'down']),
    redis: z.enum(['up', 'down']),
  }),
});
export type ReadinessResponse = z.infer<typeof readinessSchema>;
export const apiErrorSchema = z.object({
  message: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  requestId: z.string().optional(),
  /** Machine-readable reason, e.g. `session_expired` or `version_conflict`. */
  code: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
export const livenessSchema = z.object({ status: z.literal('ok') });

export * from './draft/index.js';
