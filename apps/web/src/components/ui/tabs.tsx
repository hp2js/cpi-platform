import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';

function Tabs({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        'group/tabs flex gap-2 data-[orientation=horizontal]:flex-col',
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit max-w-full items-stretch overflow-x-auto text-base-dark group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-base-lighter group-data-[orientation=vertical]/tabs:flex-col',
  {
    variants: {
      variant: {
        default: '',
        line: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Same current-item treatment as the USWDS header nav: 4 px primary bar, bold ink text.
        "relative inline-flex min-h-touch items-center justify-center gap-2 border-b-4 border-transparent px-4 py-2 text-sm font-bold whitespace-nowrap text-base-dark hover:text-primary disabled:cursor-not-allowed disabled:text-disabled group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start data-[state=active]:border-primary data-[state=active]:text-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
