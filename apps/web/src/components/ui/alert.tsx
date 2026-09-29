import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** USWDS alert (usa-alert): 8 px state-coloured left bar on the state's lightest fill. */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 border-l-8 px-5 py-4 text-sm text-ink has-[>svg]:grid-cols-[calc(var(--spacing)*6)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-6 [&>svg]:text-ink',
  {
    variants: {
      variant: {
        default: 'border-info bg-info-lighter',
        info: 'border-info bg-info-lighter',
        success: 'border-success bg-success-lighter',
        warning: 'border-warning bg-warning-lighter',
        destructive: 'border-error bg-error-lighter',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      // Errors interrupt; informational notices are announced politely, if at all.
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 text-md leading-tight font-bold', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'col-start-2 grid max-w-measure justify-items-start gap-2 text-sm text-ink',
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
