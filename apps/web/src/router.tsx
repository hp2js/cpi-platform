import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { parseSearch } from './lib/search';

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link
            to="/"
            search={{ q: '', sort: 'name', desc: false }}
            className="flex items-center gap-3 font-semibold"
          >
            <span
              className="flex size-10 items-center justify-center rounded-lg bg-primary text-white"
              aria-hidden="true"
            >
              C
            </span>
            <span>
              CPI Platform
              <span className="block text-xs font-normal text-muted-foreground">
                HP2JS · Adili V3 / Track 2
              </span>
            </span>
          </Link>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            Development foundation
          </span>
        </div>
      </header>
      <Outlet />
      <footer className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
        HP2JS · Corruption prevention reporting
      </footer>
    </>
  ),
  notFoundComponent: () => (
    <main id="main" className="p-8">
      <h1>Page not found</h1>
      <Link to="/" search={{ q: '', sort: 'name', desc: false }}>
        Return to the foundation
      </Link>
    </main>
  ),
  errorComponent: () => (
    <main id="main" className="p-8" role="alert">
      This page could not load. Refresh to try again.
    </main>
  ),
});
export const foundationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: parseSearch,
  component: lazyRouteComponent(
    () => import('./screens/foundation'),
    'FoundationPage',
  ),
});
export function makeRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree: rootRoute.addChildren([foundationRoute]),
    context: { queryClient },
  });
}
export type AppRouter = ReturnType<typeof makeRouter>;
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
