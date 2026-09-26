import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from './app/query-client';
import { makeRouter } from './app/router';
import { hasUnsavedWork } from './features/session/unsaved-work';
import './styles.css';

const mockMode =
  import.meta.env.DEV && (import.meta.env.VITE_API_MODE ?? 'mock') === 'mock';
const DevToolbar = mockMode
  ? lazy(() =>
      import('./mocks/dev-toolbar').then((module) => ({
        default: module.DevToolbar,
      })),
    )
  : null;

const publicPaths = new Set(['/sign-in', '/session-expired', '/forbidden']);
const queryClient = makeQueryClient((code) => {
  if (publicPaths.has(router.state.location.pathname)) return;
  // Never navigate away from unsaved input; the editor shows how to sign in again.
  if (hasUnsavedWork()) return;
  const destination =
    code === 'session_expired'
      ? router.navigate({ to: '/session-expired' })
      : router.navigate({
          to: '/sign-in',
          search: { redirect: router.state.location.href },
        });
  // Leave the signed-in area before dropping its cached, identity-scoped data.
  void destination.then(() => queryClient.removeQueries());
});
const router = makeRouter(queryClient);

async function start() {
  if (mockMode) {
    const { startMockApi } = await import('./mocks/browser');
    await startMockApi();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          {DevToolbar && (
            <Suspense fallback={null}>
              <DevToolbar router={router} />
            </Suspense>
          )}
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void start();
