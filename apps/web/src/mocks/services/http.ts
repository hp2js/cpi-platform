import { HttpResponse } from 'msw';
import type { ApiErrorBody } from '@cpi/contracts';

/** Error responses use the same envelope as the real API filter. */
export function apiError(
  status: number,
  message: string,
  code?: string,
  fieldErrors?: Record<string, string>,
) {
  const body: ApiErrorBody = {
    message,
    requestId: crypto.randomUUID(),
    ...(code ? { code } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  };
  return HttpResponse.json(body, { status });
}

/** Out-of-scope reads are indistinguishable from missing records, so nothing leaks (AT01). */
export const notFound = () =>
  apiError(404, 'The requested resource does not exist.', 'not_found');
export const forbidden = () =>
  apiError(403, 'You do not have access to this action.', 'forbidden');
