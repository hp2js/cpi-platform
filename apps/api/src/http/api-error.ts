import { HttpException } from '@nestjs/common';

/** A business error in the agreed envelope `{ message, code?, fieldErrors? }`. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    message: string,
    code?: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(
      {
        message,
        ...(code ? { code } : {}),
        ...(fieldErrors ? { fieldErrors } : {}),
      },
      status,
    );
  }
}

/** Out-of-scope reads are indistinguishable from missing records, so nothing leaks (AT01). */
export const notFound = () =>
  new ApiError(404, 'The requested resource does not exist.', 'not_found');
export const forbidden = () =>
  new ApiError(403, 'You do not have access to this action.', 'forbidden');

/** For `SchemaValidationPipe`: the endpoint's own 422 message, field errors and code. */
export const invalidBody =
  (
    message: string,
    fieldErrors?: Record<string, string>,
    code = 'invalid_request',
  ) =>
  () =>
    new ApiError(422, message, code, fieldErrors);
