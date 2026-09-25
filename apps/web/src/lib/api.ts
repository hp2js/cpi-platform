import type { ApiErrorBody, ReadinessResponse } from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function request<T>(
  path: `/api/${string}`,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => ({}))) as Partial<ApiErrorBody>;
    throw new ApiError(
      response.status,
      typeof body.message === 'string'
        ? body.message
        : 'The service is unavailable. Please try again.',
      body.fieldErrors,
    );
  }
  return response.json() as Promise<T>;
}
export const healthQuery = queryOptions({
  queryKey: ['system', 'readiness'],
  queryFn: ({ signal }) =>
    request<ReadinessResponse>('/api/health/ready', { signal }),
  refetchInterval: 30_000,
});
