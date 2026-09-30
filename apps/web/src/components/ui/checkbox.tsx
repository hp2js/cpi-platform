import * as React from 'react';
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-5 shrink-0 rounded-sm border-2 border-ink bg-white disabled:cursor-not-allowed disabled:border-disabled-light disabled:bg-disabled-lighter aria-invalid:border-error-dark data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white disabled:data-[state=checked]:border-disabled-light disabled:data-[state=checked]:bg-disabled-light',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-4 stroke-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
