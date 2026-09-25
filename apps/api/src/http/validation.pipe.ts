import {
  Injectable,
  UnprocessableEntityException,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';

@Injectable()
export class SchemaValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
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
