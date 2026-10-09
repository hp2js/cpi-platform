import type { Role, Session } from '@cpi/contracts';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { roleLabel, sessionKeys } from '@/features/session/queries';
import { isApiError } from '@/lib/api';

/**
 * Why a missing record is missing, for the person looking. Reads outside someone's scope are
 * answered "not found" so they reveal nothing (404, not 403); only roles that see everything
 * can be told plainly that it does not exist.
 */
const notFoundReason: Record<Role, string> = {
  administrator:
    'It may have been discarded or replaced since this page opened, or the link may be out of date.',
  supervisor:
    'It may have been discarded or replaced since this page opened, or the link may be out of date.',
  officer:
    'It may have been discarded or replaced, the link may be out of date, or it may belong to an institution outside your portfolio.',
  institution:
    'It may have been discarded or replaced, the link may be out of date, or it may belong to another institution.',
};

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
        <div className="bg-base-lightest px-5 py-6 text-sm text-ink">
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
  return <QueryError query={query} label={label} />;
}

/** Says which problem it is: not found, not permitted, or not loaded (and why). */
function QueryError<T>({
  query,
  label,
}: {
  query: UseQueryResult<T>;
  label: string;
}) {
  const role = useQueryClient().getQueryData<Session | null>(
    sessionKeys.session,
  )?.user.role;
  const error = query.error;
  // "the reporting calendar", but "your institution".
  const what = /^(your|my) /.test(label) ? label : `the ${label}`;
  const forbidden = isApiError(error, 403);
  const notFound = isApiError(error, 404);
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {forbidden
          ? `You do not have permission to view ${what}.`
          : notFound
            ? `We could not find ${what}.`
            : `We could not load ${what}.`}
      </AlertTitle>
      <AlertDescription>
        <p>
          {forbidden
            ? `${role ? `Your role (${roleLabel[role]}) does not include this.` : 'Your account does not include this.'} If you need it, ask an administrator.`
            : notFound
              ? role
                ? notFoundReason[role]
                : 'It may have been discarded or replaced, or the link may be out of date.'
              : error?.message}
        </p>
        {isApiError(error) && error.requestId && (
          <p className="text-xs">Reference: {error.requestId}</p>
        )}
        {!forbidden && (
          <Button
            variant="plain"
            size="sm"
            className="mt-2"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCcw aria-hidden="true" />
            {notFound ? 'Check again' : 'Try again'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
