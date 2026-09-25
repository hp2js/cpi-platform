import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

export interface CorrelatedRequest extends Request {
  requestId?: string;
}
const logger = new Logger('HTTP');
// Only codes with a fixed, credential-free shape are logged: Node system errors
// (ECONNREFUSED, ETIMEDOUT...) and PostgreSQL SQLSTATEs (28P01, 57P01...).
const safeCode = /^(E[A-Z_]{2,30}|[0-9A-Z]{5})$/;
// Drivers report some failures without a code; classify them by fixed phrases
// instead of logging messages that may contain hosts, users or query text.
const knownMessages: [RegExp, string][] = [
  [/timeout|timed out/i, 'TIMEOUT'],
  [
    /connection is closed|stream isn't writeable|connection terminated/i,
    'CONNECTION_CLOSED',
  ],
];
export function errorCode(error: unknown, depth = 0): string {
  if (typeof error !== 'object' || error === null || depth > 3)
    return 'DEPENDENCY_ERROR';
  if (
    'code' in error &&
    typeof error.code === 'string' &&
    safeCode.test(error.code)
  )
    return error.code;
  // Drizzle wraps driver errors in `cause`; dual-stack connects raise AggregateError.
  const nested = [
    ...('cause' in error ? [error.cause] : []),
    ...(error instanceof AggregateError ? error.errors : []),
  ];
  for (const inner of nested) {
    const code = errorCode(inner, depth + 1);
    if (code !== 'DEPENDENCY_ERROR') return code;
  }
  const message = error instanceof Error ? error.message : '';
  return (
    knownMessages.find(([pattern]) => pattern.test(message))?.[1] ??
    'DEPENDENCY_ERROR'
  );
}
export function requestContext(
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const start = performance.now();
  res.once('finish', () => {
    // Container health probes poll every few seconds; only log them when they fail.
    if (req.path.startsWith('/api/health/') && res.statusCode < 400) return;
    // Deliberately omit URL, query, body, cookies and authorization headers.
    logger.log({
      event: 'http.request',
      requestId,
      method: req.method,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - start),
    });
  });
  next();
}
