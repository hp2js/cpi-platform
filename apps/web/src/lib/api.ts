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
let overrideReason: string | null = null;
/**
 * An administrator's justified override for review actions (FR10). While set, review writes
 * carry the justification; the server records each use. Clear it when leaving the review.
 */
export function setOverrideReason(reason: string | null) {
  overrideReason = reason;
}

let beforeRequest: (() => Promise<void>) | null = null;
/** Registers work to finish before every API call; development mock mode uses it. */
export function setBeforeRequest(hook: () => Promise<void>) {
  beforeRequest = hook;
}
export async function awaitBeforeRequest() {
  await beforeRequest?.();
}

/** Sends a request and returns the response once it is known to be successful. */
async function send(
  path: `/api/${string}`,
  options: RequestOptions,
): Promise<Response> {
  const { json, timeoutMs = 5000, ...init } = options;
  if (json !== undefined && init.body != null)
    throw new Error('Choose json or body, not both.');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (
    overrideReason &&
    path.startsWith('/api/reviews/') &&
    (init.method ?? 'GET') !== 'GET'
  )
    headers.set('X-Override-Reason', overrideReason);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  await awaitBeforeRequest();
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
  return response;
}

export async function request<T>(
  path: `/api/${string}`,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
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
/** Fetches a file (such as evidence) with the same session, timeout and error handling. */
export async function requestFile(
  path: `/api/${string}`,
  options: RequestOptions = {},
): Promise<Blob> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  const response = await send(path, { timeoutMs: 30_000, ...options, headers });
  return response.blob();
}

/** A downloaded file with the name and type the server gave it. */
export interface FetchedFile {
  blob: Blob;
  fileName: string | null;
  mimeType: string;
  /** The mock API serves a labelled stand-in when it has no stored contents. */
  demonstration: boolean;
}

/** The file name from a Content-Disposition header, preferring the UTF-8 form. */
export function dispositionFileName(header: string | null) {
  if (!header) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1]!);
    } catch {
      /* fall through to the plain name */
    }
  }
  return /filename="([^"]*)"/i.exec(header)?.[1] ?? null;
}

export async function fetchFile(
  path: `/api/${string}`,
  options: RequestOptions = {},
): Promise<FetchedFile> {
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', '*/*');
  const response = await send(path, { timeoutMs: 30_000, ...options, headers });
  const blob = await response.blob();
  return {
    blob,
    fileName: dispositionFileName(response.headers.get('Content-Disposition')),
    mimeType:
      response.headers.get('Content-Type')?.split(';')[0]?.trim() ||
      blob.type ||
      'application/octet-stream',
    demonstration: response.headers.get('X-Demonstration-Copy') === 'true',
  };
}

export const healthQuery = queryOptions({
  queryKey: ['system', 'readiness'],
  queryFn: ({ signal }) =>
    request('/api/health/ready', readinessSchema, { signal }),
  refetchInterval: 30_000,
});

/** The real API by default; VITE_API_MODE=mock runs the in-browser mock instead (dev only). */
export const mockApi =
  import.meta.env.DEV && import.meta.env.VITE_API_MODE === 'mock';
