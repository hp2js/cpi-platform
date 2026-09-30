import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  apiErrorSchema,
  readinessSchema,
  type ApiErrorBody,
} from '@cpi/contracts';
import { ApiError } from './api-error';
import type { CorrelatedRequest } from './diagnostics';

// Nest's unmatched-route 404 ("Cannot GET /path?query") echoes the URL, which can
// carry tokens or identifiers.
const unmatchedRoute = /^Cannot [A-Z]+ \//;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const req = context.getRequest<CorrelatedRequest>();
    const res = context.getResponse<Response>();
    if (res.headersSent) return;
    const raw =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    // Readiness retains its machine-readable service status; business errors use the envelope.
    const readiness = readinessSchema.safeParse(raw);
    if (status === 503 && readiness.success) {
      res.status(status).json(readiness.data);
      return;
    }
    if (
      status === 413 &&
      req.headers['content-type']?.startsWith('multipart/form-data')
    ) {
      res.status(413).json({
        message: 'Files must be 20 MB or smaller.',
        code: 'upload_rejected',
        fieldErrors: { file: 'Files must be 20 MB or smaller.' },
        requestId: req.requestId,
      });
      return;
    }
    const parsed = apiErrorSchema.safeParse(raw);
    const storageError =
      exception instanceof ApiError &&
      status === 503 &&
      parsed.success &&
      ['storage_unavailable', 'file_unavailable'].includes(
        parsed.data.code ?? '',
      );
    const body: ApiErrorBody = {
      message:
        status >= 500 && !storageError
          ? 'An unexpected server error occurred.'
          : !parsed.success
            ? 'The request could not be completed.'
            : unmatchedRoute.test(parsed.data.message)
              ? 'The requested resource does not exist.'
              : parsed.data.message,
      requestId: req.requestId,
    };
    if (status < 500 && parsed.success && parsed.data.fieldErrors) {
      body.fieldErrors = parsed.data.fieldErrors;
    }
    // The client branches on status and code (e.g. `session_expired`, `version_conflict`).
    if ((status < 500 || storageError) && parsed.success && parsed.data.code) {
      body.code = parsed.data.code;
    }
    if (status >= 500) {
      this.logger.error({
        event: 'http.failure',
        requestId: req.requestId,
        status,
        error: exception instanceof Error ? exception.name : typeof exception,
      });
    }
    res.status(status).json(body);
  }
}
