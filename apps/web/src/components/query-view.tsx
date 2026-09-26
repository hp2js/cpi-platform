import type { UseQueryResult } from '@tanstack/react-query';
import { RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';

/**
 * Renders the loading, error and empty states every data view needs, and keeps showing
 * previous data during background refreshes.
 */
export function QueryView<T>({
  query,
  label,
  isEmpty,
  empty,
  children,
}: {
  query: UseQueryResult<T>;
  /** What is loading, e.g. "reporting obligations"; used in status and error text. */
  label: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) {
    if (isEmpty?.(query.data))
      return (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {empty}
        </div>
      );
    return children(query.data);
  }
  if (query.isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-2">
        <span className="sr-only">Loading {label}…</span>
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  const error = query.error;
  const unavailable = isApiError(error, 403) || isApiError(error, 404);
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {unavailable
          ? `These ${label} are not available to you.`
          : `We could not load ${label}.`}
      </AlertTitle>
      <AlertDescription>
        <p>
          {unavailable
            ? 'Check that you are signed in with the right account.'
            : error?.message}
        </p>
        {isApiError(error) && error.requestId && (
          <p className="text-xs">Reference: {error.requestId}</p>
        )}
        {!unavailable && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
