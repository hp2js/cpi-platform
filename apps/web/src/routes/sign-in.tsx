import type { DemoAccount, Role } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Gauge,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Brand } from '@/components/brand';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  demoAccountsQuery,
  roleHome,
  roleLabel,
  signIn,
} from '@/features/session/queries';

const route = getRouteApi('/sign-in');

const roleOrder: { role: Role; icon: LucideIcon; description: string }[] = [
  {
    role: 'institution',
    icon: Building2,
    description: 'Prepare and submit quarterly reports, answer clarifications.',
  },
  {
    role: 'officer',
    icon: ClipboardList,
    description:
      'Review assigned institutions, request clarification, finalize.',
  },
  {
    role: 'supervisor',
    icon: Gauge,
    description:
      'Monitor coverage, backlog and results across all institutions.',
  },
  {
    role: 'administrator',
    icon: Settings,
    description:
      'Configure the cycle and forms, publish results, run the simulation.',
  },
];

export function SignInPage() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useQuery(demoAccountsQuery);
  const mutation = useMutation({
    mutationFn: (account: DemoAccount) => signIn(queryClient, account.id),
    onSuccess: async (session) => {
      const home = roleHome[session.user.role];
      await navigate({ to: redirect?.startsWith(home) ? redirect : home });
    },
  });

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card px-6 py-4">
        <Brand />
      </header>
      <main id="main" className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to the demonstration
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Choose a fictional demo account. Every institution, person and record
          here is synthetic. Real authentication replaces this picker before any
          pilot.
        </p>
        {mutation.isError && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        )}
        <div className="mt-8">
          <QueryView query={accounts} label="demo accounts">
            {(list) => (
              <div className="grid gap-6 md:grid-cols-2">
                {roleOrder.map(({ role, icon: Icon, description }) => {
                  const group = list.filter((account) => account.role === role);
                  if (group.length === 0) return null;
                  return (
                    <section
                      key={role}
                      aria-labelledby={`role-${role}`}
                      className="rounded-xl border bg-card p-5"
                    >
                      <h2
                        id={`role-${role}`}
                        className="flex items-center gap-2 font-semibold"
                      >
                        <Icon
                          className="size-5 text-primary"
                          aria-hidden="true"
                        />
                        {roleLabel[role]}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                      </p>
                      <ul className="mt-4 grid gap-2">
                        {group.map((account) => (
                          <li key={account.id}>
                            <button
                              type="button"
                              disabled={mutation.isPending}
                              onClick={() => mutation.mutate(account)}
                              className="group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                            >
                              <span>
                                <span className="font-medium">
                                  {account.displayName}
                                </span>
                                {account.institutionId && (
                                  <span className="sr-only">
                                    , institution {account.institutionId}
                                  </span>
                                )}
                              </span>
                              <span className="flex items-center gap-1 text-primary">
                                {mutation.isPending &&
                                mutation.variables?.id === account.id
                                  ? 'Signing in…'
                                  : 'Sign in'}
                                <ArrowRight
                                  className="size-4 transition-transform group-hover:translate-x-0.5"
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
          </QueryView>
        </div>
      </main>
    </div>
  );
}
