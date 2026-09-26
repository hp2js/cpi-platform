import { apiErrorSchema, readinessSchema } from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
    readonly requestId?: string,
    /** Machine-readable reason from the error envelope, e.g. `session_expired`. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Resolves an API path against the page origin; Node-environment tests have no page. */
export function apiUrl(path: string) {
  return new URL(path, globalThis.location?.origin ?? 'http://localhost');
}

/** The request never reached the server or its response was lost; it is safe to retry. */
export class NetworkError extends Error {}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return (
    error instanceof ApiError &&
    (status === undefined || error.status === status)
  );
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | null;
  json?: unknown;
  /** Defaults to five seconds; long-running administrative actions may extend it. */
  timeoutMs?: number;
};
export async function request<T>(
  path: `/api/${string}`,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { json, timeoutMs = 5000, ...init } = options;
  if (json !== undefined && init.body != null)
    throw new Error('Choose json or body, not both.');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      body: json === undefined ? init.body : JSON.stringify(json),
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // A caller's own cancellation is not an error to report.
    if (init.signal?.aborted) throw error;
    throw new NetworkError(
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'The service took too long to respond. Your entries are kept; please try again.'
        : 'The connection was interrupted. Your entries are kept; check your network and try again.',
    );
  }
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    throw new ApiError(
      response.status,
      parsed.success
        ? parsed.data.message
        : 'The service is unavailable. Please try again.',
      parsed.success ? parsed.data.fieldErrors : {},
      requestId ?? (parsed.success ? parsed.data.requestId : undefined),
      parsed.success ? parsed.data.code : undefined,
    );
  }
  const text = await response.text();
  let value: unknown;
  try {
    value = text.length ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(
      response.status,
      'The server returned an invalid response.',
      {},
      requestId,
    );
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(
      response.status,
      'The server returned an invalid response.',
      {},
      requestId,
    );
  return parsed.data;
}
export const healthQuery = queryOptions({
  queryKey: ['system', 'readiness'],
  queryFn: ({ signal }) =>
    request('/api/health/ready', readinessSchema, { signal }),
  refetchInterval: 30_000,
});
