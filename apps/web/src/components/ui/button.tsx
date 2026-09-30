import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

/**
 * A 44 × 44 px target centred on a smaller control: the pseudo-element takes the pointer for
 * its button, so compact buttons stay easy to hit (MASTER: 44 px minimum target).
 */
const compactTarget =
  'relative after:absolute after:top-1/2 after:left-1/2 after:h-touch after:w-[max(100%,var(--spacing-touch))] after:-translate-x-1/2 after:-translate-y-1/2';

/** USWDS button (usa-button): 44 px target, bold, 4 px radius, no shadows. */
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
        // Neutral secondary: dismissive and utility actions (Cancel, Close, Back, Print,
        // Download, Retry, pagination, toolbars), so purple stays for the actions that matter.
        plain:
          'bg-white text-ink shadow-[inset_0_0_0_1px_var(--color-base-dark)] hover:bg-base-lightest active:bg-base-lighter',
        ghost:
          'text-primary hover:bg-base-lightest hover:text-primary-dark active:text-primary-darker disabled:bg-transparent disabled:text-disabled',
        // usa-button--unstyled
        link: 'font-normal text-primary underline underline-offset-2 hover:text-primary-dark disabled:bg-transparent disabled:text-disabled',
      },
      // Primary and form actions are 44 px. Compact sizes (secondary actions, toolbars, rows)
      // look 36 px; an invisible ::after keeps the 44 px target, so no hit area shrinks.
      size: {
        default: 'min-h-touch px-5 py-3 text-md',
        xs: `min-h-compact px-3 py-1 text-sm ${compactTarget}`,
        sm: `min-h-compact px-4 py-1 text-sm ${compactTarget}`,
        lg: 'min-h-12 px-6 py-4 text-lg',
        icon: 'size-touch',
        'icon-xs': `size-compact ${compactTarget}`,
        'icon-sm': `size-compact ${compactTarget}`,
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
