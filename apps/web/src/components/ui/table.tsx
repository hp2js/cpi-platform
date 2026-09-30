import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A wide table scrolls horizontally inside its container. While it overflows, the container
 * joins the tab order so keyboard users can scroll it (WCAG 2.1.1); otherwise it adds no stop.
 */
function useScrollableFocus() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = React.useState(false);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () =>
      setScrollable(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return { ref, scrollable };
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const { ref, scrollable } = useScrollableFocus();
  return (
    <div
      ref={ref}
      data-slot="table-container"
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? 'region' : undefined}
      aria-label={scrollable ? 'Scrollable table' : undefined}
      // Only horizontal scrolling: a screen-reader-only caption sits just outside a short table
      // and would otherwise make an unfocusable vertical scroll area.
      className="relative w-full overflow-x-auto overflow-y-hidden"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-ink', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-base-lightest font-bold [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-base-lighter has-aria-expanded:bg-base-lightest data-[state=selected]:bg-primary-lighter',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-touch px-4 py-2 text-left align-top font-bold [thead_&]:align-bottom whitespace-nowrap text-ink [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'px-4 py-2 align-top whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        'mt-4 px-2 pb-3 text-left text-sm text-base-dark',
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
