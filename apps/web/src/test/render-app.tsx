import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeQueryClient } from '@/app/query-client';
import { makeRouter } from '@/app/router';
import { apiUrl } from '@/lib/api';

/** Renders the whole app at `path` against the mock API, as a signed-out visitor would see it. */
export function renderApp(path: string) {
  const queryClient = makeQueryClient(() => undefined);
  const router = makeRouter(
    queryClient,
    createMemoryHistory({ initialEntries: [path] }),
  );
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, user };
}

/** Starts a mock session for a demo account, as if the user had signed in earlier. */
export async function signInAs(accountId: string) {
  const response = await fetch(apiUrl('/api/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (!response.ok) throw new Error(`Could not sign in as ${accountId}`);
}
