import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { SchemaValidationPipe } from './validation.pipe';
import {
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { errorCode, requestContext } from './diagnostics';
import { ApiExceptionFilter } from './errors.filter';
import type { ArgumentsHost } from '@nestjs/common';
import type { CorrelatedRequest } from './diagnostics';
import { json, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { redactBodyErrors } from './body-parsers';

describe('request validation', () => {
  const pipe = new SchemaValidationPipe(
    z.strictObject({ name: z.string().min(3) }),
  );
  it('rejects invalid and unknown fields without echoing submitted secrets', () => {
    expect(() => pipe.transform({ name: 'x', password: 'secret' })).toThrow(
      UnprocessableEntityException,
    );
    try {
      pipe.transform({ name: 'x' });
    } catch (error) {
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        message: 'Check the submitted values.',
        fieldErrors: { name: 'Invalid value.' },
      });
    }
  });
  it('returns validated data', () =>
    expect(pipe.transform({ name: 'Example' })).toEqual({ name: 'Example' }));
});
it('only logs safe dependency error codes', () => {
  expect(errorCode({ code: 'ECONNREFUSED', message: 'password=secret' })).toBe(
    'ECONNREFUSED',
  );
  expect(errorCode({ code: 'secret-password' })).toBe('DEPENDENCY_ERROR');
  expect(errorCode(new Error('wrapped', { cause: { code: '28P01' } }))).toBe(
    '28P01',
  );
  expect(errorCode(new AggregateError([{ code: 'ECONNREFUSED' }]))).toBe(
    'ECONNREFUSED',
  );
  expect(
    errorCode(new Error('Command timed out for redis://user:secret@host')),
  ).toBe('TIMEOUT');
  expect(
    errorCode(new Error('password authentication failed for user "secret"')),
  ).toBe('DEPENDENCY_ERROR');
});
it('correlates requests without logging submitted data or headers', () => {
  const log = vi
    .spyOn(Logger.prototype, 'log')
    .mockImplementation(() => undefined);
  let finished: (() => void) | undefined;
  const req = {
    method: 'POST',
    path: '/api/example',
    url: '/api/example?secret=hidden',
    body: { password: 'hidden' },
  } as CorrelatedRequest;
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    once: (_: string, cb: () => void) => {
      finished = cb;
    },
  } as unknown as Response;
  requestContext(req, res, vi.fn());
  finished?.();
  expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
  expect(JSON.stringify(log.mock.calls)).not.toContain('hidden');
  expect(log).toHaveBeenCalledWith(
    expect.objectContaining({ requestId: req.requestId, status: 200 }),
  );
  log.mockRestore();
});
it('hides unexpected exception details but returns the request ID', () => {
  const logger = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'correlation' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(new Error('password=hidden'), host);
  expect(response.status).toHaveBeenCalledWith(500);
  expect(response.json).toHaveBeenCalledWith({
    message: 'An unexpected server error occurred.',
    requestId: 'correlation',
  });
  expect(JSON.stringify(logger.mock.calls)).not.toContain('hidden');
  logger.mockRestore();
});
it('replaces body-parser messages that quote the submitted body', async () => {
  const parse = redactBodyErrors(json());
  const req = Readable.from(['{"password":hidden}']) as unknown as Request;
  Object.assign(req, {
    headers: { 'content-type': 'application/json', 'content-length': '19' },
  });
  const error = await new Promise<unknown>((resolve) =>
    parse(req, {} as Response, resolve),
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(400);
  expect(JSON.stringify((error as HttpException).getResponse())).not.toContain(
    'hidden',
  );
});
it('does not echo the requested URL for unmatched routes', () => {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'correlation' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  const filter = new ApiExceptionFilter();
  filter.catch(new NotFoundException('Cannot GET /api/x?token=hidden'), host);
  expect(response.status).toHaveBeenCalledWith(404);
  expect(response.json).toHaveBeenCalledWith({
    message: 'The requested resource does not exist.',
    requestId: 'correlation',
  });
  filter.catch(new NotFoundException('Report not found.'), host);
  expect(response.json).toHaveBeenLastCalledWith({
    message: 'Report not found.',
    requestId: 'correlation',
  });
});
