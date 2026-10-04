import type { z } from 'zod';
import { ApiError } from '../http/api-error';

/** The settings screens' 422: one message, the validator's message per field. */
export const invalidSettings = (error: z.ZodError) =>
  new ApiError(
    422,
    'Some values need attention.',
    'invalid_settings',
    Object.fromEntries(
      error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    ),
  );

/** Validates a settings body where it cannot be done by a pipe (after a lookup). */
export function settingsBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidSettings(parsed.error);
  return parsed.data;
}
