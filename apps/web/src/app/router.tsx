import type { QueryClient } from '@tanstack/react-query';
import type { Role } from '@cpi/contracts';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { roleHome, sessionQuery } from '@/features/session/queries';
import { isApiError } from '@/lib/api';
import {
  ForbiddenPage,
  NotFoundPage,
  RouteErrorPage,
  SessionExpiredPage,
} from '@/routes/system-pages';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

/** Accept only same-origin relative paths as post-sign-in destinations. */
function safeRedirect(value: unknown) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : undefined;
}

async function loadSession(queryClient: QueryClient) {
  try {
    return await queryClient.ensureQueryData(sessionQuery);
  } catch (error) {
    if (isApiError(error, 401)) return undefined;
    throw error;
  }
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-in',
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: lazyRouteComponent(() => import('@/routes/sign-in'), 'SignInPage'),
});
const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'forbidden',
  component: ForbiddenPage,
});
const sessionExpiredRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'session-expired',
  component: SessionExpiredPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context.queryClient);
    throw redirect(
      session
        ? { to: roleHome[session.user.role] }
        : { to: '/sign-in', search: { redirect: undefined } },
    );
  },
});

/**
 * Guards improve navigation only. The API remains the authority and rejects out-of-scope
 * requests independently (PRD §5.2).
 */
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  beforeLoad: async ({ context, location }) => {
    const session = await loadSession(context.queryClient);
    if (!session)
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    return { session };
  },
  component: Outlet,
});

function requireRole(role: Role) {
  return ({ context }: { context: { session: { user: { role: Role } } } }) => {
    if (context.session.user.role !== role)
      throw redirect({ to: '/forbidden' });
  };
}

export const institutionRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'institution',
  beforeLoad: requireRole('institution'),
  component: lazyRouteComponent(
    () => import('@/layouts/institution-layout'),
    'InstitutionLayout',
  ),
});
export const officerRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'officer',
  beforeLoad: requireRole('officer'),
  component: lazyRouteComponent(
    () => import('@/layouts/officer-layout'),
    'OfficerLayout',
  ),
});
export const supervisorRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'supervisor',
  beforeLoad: requireRole('supervisor'),
  component: lazyRouteComponent(
    () => import('@/layouts/supervisor-layout'),
    'SupervisorLayout',
  ),
});
export const adminRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: 'admin',
  beforeLoad: requireRole('administrator'),
  component: lazyRouteComponent(
    () => import('@/layouts/admin-layout'),
    'AdminLayout',
  ),
});

const institutionHomeRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/routes/institution/home'),
    'InstitutionHomePage',
  ),
});
const officerHomeRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/routes/officer/home'),
    'OfficerHomePage',
  ),
});
const supervisorHomeRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/routes/supervisor/home'),
    'SupervisorHomePage',
  ),
});
const adminHomeRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: lazyRouteComponent(
    () => import('@/routes/admin/home'),
    'AdminHomePage',
  ),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  forbiddenRoute,
  sessionExpiredRoute,
  authedRoute.addChildren([
    institutionRoute.addChildren([institutionHomeRoute]),
    officerRoute.addChildren([officerHomeRoute]),
    supervisorRoute.addChildren([supervisorHomeRoute]),
    adminRoute.addChildren([adminHomeRoute]),
  ]),
]);

export function makeRouter(
  queryClient: QueryClient,
  history?: Parameters<typeof createRouter>[0]['history'],
) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    ...(history ? { history } : {}),
  });
}
export type AppRouter = ReturnType<typeof makeRouter>;
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
