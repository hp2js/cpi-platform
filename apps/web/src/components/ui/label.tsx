import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label as LabelPrimitive } from 'radix-ui';

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-tight font-normal text-ink select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-disabled-dark peer-disabled:cursor-not-allowed peer-disabled:text-disabled-dark',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
