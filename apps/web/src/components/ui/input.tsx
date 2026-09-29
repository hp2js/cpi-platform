import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The USWDS field box shared by every text-like control (input, select, autocomplete, textarea),
 * so they always match: 44 px, square, 1 px base-dark border, 4 px error-dark border when invalid.
 */
export const fieldControl =
  'w-full min-w-0 border border-base-dark bg-white px-2 text-sm text-ink placeholder:text-base disabled:cursor-not-allowed disabled:bg-disabled-lighter disabled:text-disabled-dark aria-invalid:border-4 aria-invalid:border-error-dark';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldControl,
        'h-touch max-w-mobile-lg py-2 file:mr-2 file:border-0 file:bg-transparent file:font-bold file:text-ink',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
