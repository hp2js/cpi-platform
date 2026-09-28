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
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect: string | undefined; demo?: 'open' } => ({
    redirect: safeRedirect(search.redirect),
    ...(search.demo === 'open' ? { demo: 'open' as const } : {}),
  }),
  component: lazyRouteComponent(() => import('@/routes/sign-in'), 'SignInPage'),
});
const optionalText = (value: unknown) =>
  typeof value === 'string' && value ? value.slice(0, 256) : undefined;
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'forgot-password',
  validateSearch: (search: Record<string, unknown>) => ({
    email: optionalText(search.email),
  }),
  component: lazyRouteComponent(
    () => import('@/routes/account-access'),
    'ForgotPasswordPage',
  ),
});
const setPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'set-password',
  validateSearch: (search: Record<string, unknown>) => ({
    token: optionalText(search.token),
  }),
  component: lazyRouteComponent(
    () => import('@/routes/account-access'),
    'SetPasswordPage',
  ),
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

const page = <T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T & string,
) => lazyRouteComponent(loader, name);

const institutionHomeRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: '/',
  component: page(
    () => import('@/routes/institution/home'),
    'InstitutionHomePage',
  ),
});
const institutionReportRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'reports/$periodId',
  component: page(() => import('@/routes/institution/report'), 'ReportPage'),
});
const institutionSubmitRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'reports/$periodId/review',
  component: page(
    () => import('@/routes/institution/review'),
    'ReviewSubmitPage',
  ),
});
const institutionReceiptsRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'receipts',
  component: page(
    () => import('@/routes/institution/receipts'),
    'ReceiptsPage',
  ),
});
const institutionReceiptRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'receipts/$receiptId',
  component: page(() => import('@/routes/institution/receipt'), 'ReceiptPage'),
});
const institutionClarificationsRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'clarifications',
  component: page(
    () => import('@/routes/institution/clarifications'),
    'ClarificationsPage',
  ),
});
const institutionPlanRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'plan',
  component: page(() => import('@/routes/institution/plan'), 'PlanPage'),
});
const institutionFoundationsRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'foundations',
  component: page(
    () => import('@/routes/institution/foundations'),
    'FoundationsPage',
  ),
});
const institutionInboxRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'inbox',
  component: page(() => import('@/routes/shared/inbox'), 'InboxPage'),
});
const officerHomeRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: '/',
  // Optional so plain links to /officer work; the open queue is the default view.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: 'open' | 'finalized' } =>
    search.tab === 'finalized' ? { tab: 'finalized' } : {},
  component: page(() => import('@/routes/officer/home'), 'OfficerHomePage'),
});
const officerReviewRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: 'reviews/$submissionId',
  component: page(() => import('@/routes/officer/review'), 'ReviewPage'),
});
const officerInstitutionRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: 'institutions/$institutionId',
  component: page(
    () => import('@/routes/officer/institution'),
    'OfficerInstitutionPage',
  ),
});
const officerInboxRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: 'inbox',
  component: page(() => import('@/routes/shared/inbox'), 'InboxPage'),
});
const supervisorHomeRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: '/',
  validateSearch: (
    search: Record<string, unknown>,
  ): { periodId?: string; institutionId?: string; officerId?: string } => ({
    ...(typeof search.periodId === 'string' && search.periodId
      ? { periodId: search.periodId }
      : {}),
    ...(typeof search.institutionId === 'string' && search.institutionId
      ? { institutionId: search.institutionId }
      : {}),
    ...(typeof search.officerId === 'string' && search.officerId
      ? { officerId: search.officerId }
      : {}),
  }),
  component: page(
    () => import('@/routes/supervisor/home'),
    'SupervisorHomePage',
  ),
});
const supervisorInboxRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'inbox',
  component: page(() => import('@/routes/shared/inbox'), 'InboxPage'),
});
const adminHomeRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: page(() => import('@/routes/admin/home'), 'AdminHomePage'),
});
const adminFormsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'forms',
  component: page(() => import('@/routes/admin/forms'), 'FormsPage'),
});
const adminFormRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'forms/$formId',
  component: page(() => import('@/routes/admin/form-editor'), 'FormEditorPage'),
});
const adminNotificationsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'notifications',
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: 'all' | 'sink' } =>
    search.tab === 'all' || search.tab === 'sink' ? { tab: search.tab } : {},
  component: page(
    () => import('@/routes/admin/notifications'),
    'NotificationsPage',
  ),
});
const adminAuditRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'audit',
  component: page(() => import('@/routes/admin/audit'), 'AuditPage'),
});

const institutionResultsRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'results',
  component: page(() => import('@/routes/institution/results'), 'ResultsPage'),
});
const supervisorWorkloadRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'workload',
  component: page(() => import('@/routes/supervisor/workload'), 'WorkloadPage'),
});
const supervisorAnnualRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'annual',
  component: page(
    () => import('@/routes/supervisor/annual'),
    'SupervisorAnnualPage',
  ),
});
const supervisorReportsRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'reports',
  component: page(() => import('@/routes/supervisor/reports'), 'ReportsPage'),
});
const supervisorInstitutionsRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'institutions',
  component: page(
    () => import('@/routes/supervisor/institutions'),
    'SupervisorInstitutionsPage',
  ),
});
const supervisorInstitutionRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'institutions/$institutionId',
  component: page(
    () => import('@/routes/supervisor/institutions'),
    'SupervisorInstitutionPage',
  ),
});
const supervisorAssignmentsRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'assignments',
  component: page(
    () => import('@/routes/supervisor/assignments'),
    'SupervisorAssignmentsPage',
  ),
});
const supervisorRulesRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'rules',
  component: page(() => import('@/routes/supervisor/rules'), 'RulesPage'),
});
const adminSimulationRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'simulation',
  component: page(() => import('@/routes/admin/simulation'), 'SimulationPage'),
});
const adminAnnualRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'annual',
  component: page(() => import('@/routes/admin/annual'), 'AnnualPage'),
});
const adminAssignmentsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'assignments',
  component: page(
    () => import('@/routes/admin/assignments'),
    'AssignmentsPage',
  ),
});

const adminProfilesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'profiles',
  component: page(() => import('@/routes/admin/profiles'), 'ProfilesPage'),
});
const adminProfileRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'profiles/$profileId',
  component: page(
    () => import('@/routes/admin/profile-detail'),
    'ProfileDetailPage',
  ),
});
const adminCalendarRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'calendar',
  component: page(() => import('@/routes/admin/calendar'), 'CalendarPage'),
});
const adminInstitutionsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'institutions',
  validateSearch: (search: Record<string, unknown>): { tab?: 'types' } =>
    search.tab === 'types' ? { tab: 'types' } : {},
  component: page(
    () => import('@/routes/admin/institutions'),
    'InstitutionsPage',
  ),
});
const adminInstitutionRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'institutions/$institutionId',
  component: page(
    () => import('@/routes/admin/institution-detail'),
    'InstitutionDetailPage',
  ),
});
const adminUsersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'users',
  component: page(() => import('@/routes/admin/users'), 'UsersPage'),
});
const accountPage = page(
  () => import('@/routes/shared/account'),
  'AccountPage',
);
const institutionAccountRoute = createRoute({
  getParentRoute: () => institutionRoute,
  path: 'account',
  component: accountPage,
});
const officerAccountRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: 'account',
  component: accountPage,
});
const supervisorAccountRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'account',
  component: accountPage,
});
const adminAccountRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'account',
  component: accountPage,
});
const supervisorSubmissionsRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'submissions',
  component: page(
    () => import('@/routes/supervisor/submissions'),
    'SubmissionsPage',
  ),
});
const supervisorReviewRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'reviews/$submissionId',
  component: page(() => import('@/routes/officer/review'), 'ReviewPage'),
});

const officerEvidenceRoute = createRoute({
  getParentRoute: () => officerRoute,
  path: 'evidence',
  component: page(() => import('@/routes/officer/evidence'), 'EvidencePage'),
});
const supervisorEvidenceRoute = createRoute({
  getParentRoute: () => supervisorRoute,
  path: 'evidence',
  component: page(() => import('@/routes/supervisor/evidence'), 'EvidencePage'),
});

const adminReviewsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'reviews',
  component: page(() => import('@/routes/admin/reviews'), 'AdminReviewsPage'),
});
const adminReviewRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: 'reviews/$submissionId',
  component: page(() => import('@/routes/officer/review'), 'ReviewPage'),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  forgotPasswordRoute,
  setPasswordRoute,
  forbiddenRoute,
  sessionExpiredRoute,
  authedRoute.addChildren([
    institutionRoute.addChildren([
      institutionHomeRoute,
      institutionReportRoute,
      institutionSubmitRoute,
      institutionReceiptsRoute,
      institutionReceiptRoute,
      institutionClarificationsRoute,
      institutionPlanRoute,
      institutionFoundationsRoute,
      institutionInboxRoute,
      institutionResultsRoute,
      institutionAccountRoute,
    ]),
    officerRoute.addChildren([
      officerHomeRoute,
      officerReviewRoute,
      officerEvidenceRoute,
      officerInstitutionRoute,
      officerInboxRoute,
      officerAccountRoute,
    ]),
    supervisorRoute.addChildren([
      supervisorHomeRoute,
      supervisorSubmissionsRoute,
      supervisorReviewRoute,
      supervisorEvidenceRoute,
      supervisorInboxRoute,
      supervisorAccountRoute,
      supervisorWorkloadRoute,
      supervisorAnnualRoute,
      supervisorReportsRoute,
      supervisorInstitutionsRoute,
      supervisorInstitutionRoute,
      supervisorAssignmentsRoute,
      supervisorRulesRoute,
    ]),
    adminRoute.addChildren([
      adminHomeRoute,
      adminSimulationRoute,
      adminAnnualRoute,
      adminAssignmentsRoute,
      adminCalendarRoute,
      adminInstitutionsRoute,
      adminInstitutionRoute,
      adminUsersRoute,
      adminAccountRoute,
      adminProfilesRoute,
      adminProfileRoute,
      adminFormsRoute,
      adminFormRoute,
      adminNotificationsRoute,
      adminReviewsRoute,
      adminReviewRoute,
      adminAuditRoute,
    ]),
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
