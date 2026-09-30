import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

/** USWDS button (usa-button): 44 px minimum target, bold, 4 px radius, no shadows. */
const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-md font-bold leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:bg-disabled-lighter disabled:text-disabled-dark disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-white hover:bg-primary-dark active:bg-primary-darker',
        // usa-button--secondary: USWDS's red, reserved for destructive actions.
        destructive:
          'bg-secondary text-white hover:bg-secondary-dark active:bg-secondary-darker',
        outline:
          'bg-white text-primary shadow-[inset_0_0_0_2px_var(--color-primary)] hover:text-primary-dark hover:shadow-[inset_0_0_0_2px_var(--color-primary-dark)] active:text-primary-darker active:shadow-[inset_0_0_0_2px_var(--color-primary-darker)]',
        // usa-button--base
        secondary: 'bg-base-dark text-white hover:bg-base-darker active:bg-ink',
        ghost:
          'text-primary hover:bg-base-lightest hover:text-primary-dark active:text-primary-darker',
        // usa-button--unstyled
        link: 'font-normal text-primary underline underline-offset-2 hover:text-primary-dark disabled:bg-transparent',
      },
      size: {
        default: 'min-h-touch px-5 py-3 text-md',
        xs: 'min-h-touch px-3 py-2 text-sm',
        sm: 'min-h-touch px-4 py-2 text-sm',
        lg: 'min-h-12 px-6 py-4 text-lg',
        icon: 'size-touch',
        'icon-xs': 'size-touch',
        'icon-sm': 'size-touch',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
