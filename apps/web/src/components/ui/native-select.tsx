import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The browser's own select, styled to match the inputs. Use it for short, fixed lists (a
 * quarter, a role, a category); use `Combobox` when the list is long or needs searching.
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <select
        data-slot="native-select"
        className="h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-1 pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { NativeSelect };
