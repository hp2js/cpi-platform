import {
  Injectable,
  UnprocessableEntityException,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates a body or query against a contract schema. `invalid` replaces the generic 422 for
 * endpoints whose contract promises a specific message or code.
 */
@Injectable()
export class SchemaValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: z.ZodType<T>,
    private readonly invalid?: (error: z.ZodError) => Error,
  ) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    if (this.invalid) throw this.invalid(result.error);
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      // Fixed public message: validators may include submitted values in their messages.
      if (key && !Object.hasOwn(fieldErrors, key))
        Object.defineProperty(fieldErrors, key, {
          value: 'Invalid value.',
          enumerable: true,
        });
    }
    throw new UnprocessableEntityException({
      message: 'Check the submitted values.',
      fieldErrors,
    });
  }
}
