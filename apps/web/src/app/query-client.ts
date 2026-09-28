import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api';

/**
 * Creates the app's QueryClient. `onUnauthorized` runs when any request (other than the
 * session check the route guards already handle) reports that the session is gone.
 */
export function makeQueryClient(onUnauthorized: (code?: string) => void) {
  const handle = (error: unknown, queryKey?: readonly unknown[]) => {
    if (!isApiError(error, 401) || queryKey?.[0] === 'session') return;
    onUnauthorized(error.code);
  };
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handle(error, query.queryKey),
    }),
    mutationCache: new MutationCache({ onError: (error) => handle(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors will not succeed on retry; one retry covers transient failures.
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status < 500) && failureCount < 1,
      },
      mutations: { retry: false },
    },
  });
}
