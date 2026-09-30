import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('motion-safe:animate-pulse bg-base-lighter', className)}
      {...props}
    />
  );
}

export { Skeleton };
