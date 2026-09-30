import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The USWDS field box shared by every text-like control (input, select, autocomplete, textarea),
 * so they always match: 44 px, square, 1 px base-dark border, 4 px error-dark border when invalid,
 * `base` placeholder text. Disabled: disabled-lighter fill, disabled-light border, disabled-dark text
 * and icon (the one disabled treatment for every control). Read-only: base-lightest fill, so a value
 * that can be copied but not changed doesn't look editable.
 * Single-line controls cap at --field-max: 480 px in single-column forms, so fields don't run the
 * width of the page, and none inside a [data-columns] container (dialogs, sheets, multi-column
 * field rows), where they fill their column so side-by-side fields line up. A width passed in
 * className still wins.
 */
export const fieldControl =
  'w-full min-w-0 border border-base-dark bg-white px-2 text-sm text-ink placeholder:text-base disabled:cursor-not-allowed disabled:border-disabled-light disabled:bg-disabled-lighter disabled:text-disabled-dark [&:disabled_svg]:text-disabled-dark [&[readonly]]:border-base-light [&[readonly]]:bg-base-lightest aria-invalid:border-4 aria-invalid:border-error-dark';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldControl,
        'h-touch max-w-(--field-max) py-2 file:mr-2 file:border-0 file:bg-transparent file:font-bold file:text-ink',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
