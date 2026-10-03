import { Logger, type ArgumentsHost } from '@nestjs/common';
import type { Request } from 'express';
import { expect, it, vi } from 'vitest';
import { loadConfig } from '../config';
import { ApiExceptionFilter } from '../http/errors.filter';
import type { Infrastructure } from '../infrastructure';
import { Sessions } from './sessions';

it('answers 503 session_store_unavailable while Redis is down, without its error details', async () => {
  const down = () => Promise.reject(new Error('connect ECONNREFUSED secret'));
  const sessions = new Sessions(
    { redis: { getex: down, pttl: down } } as unknown as Infrastructure,
    loadConfig({
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
    }),
  );
  const request = { headers: { cookie: 'cpi_session=abc' } } as Request;
  const error = await sessions.resolve(request).catch((caught) => caught);
  await expect(sessions.lockedFor('a@example.invalid')).rejects.toMatchObject({
    status: 503,
  });

  const logger = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  new ApiExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getRequest: () => ({ requestId: 'correlation', headers: {} }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost);
  expect(response.status).toHaveBeenCalledWith(503);
  expect(response.json).toHaveBeenCalledWith({
    message: 'Sign-in is temporarily unavailable. Please try again shortly.',
    code: 'session_store_unavailable',
    requestId: 'correlation',
  });
  expect(JSON.stringify(logger.mock.calls)).not.toContain('secret');
  logger.mockRestore();
});
