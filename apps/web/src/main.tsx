import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from './app/query-client';
import { makeRouter } from './app/router';
import { hasUnsavedWork } from './features/session/unsaved-work';
import { mockApi } from './lib/api';
import './styles.css';

const mockMode = mockApi;
const DevToolbar = import.meta.env.DEV
  ? lazy(() =>
      import('./mocks/dev-toolbar').then((module) => ({
        default: module.DevToolbar,
      })),
    )
  : null;

const publicPaths = new Set([
  '/sign-in',
  '/forgot-password',
  '/set-password',
  '/session-expired',
  '/forbidden',
  '/accessibility',
]);
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
  // In development the service worker also injects network faults for recovery rehearsals;
  // against the real API it handles nothing else.
  if (import.meta.env.DEV) {
    const { startMockApi } = await import('./mocks/browser');
    await startMockApi(mockMode ? 'mock' : 'faults-only');
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          {DevToolbar && (
            <Suspense fallback={null}>
              <DevToolbar router={router} live={!mockMode} />
            </Suspense>
          )}
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void start();
