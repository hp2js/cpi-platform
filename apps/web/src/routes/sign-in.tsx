import type { AuthConfig, DemoAccount, Role } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  Landmark,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@/components/brand';
import { QueryView } from '@/components/query-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  authConfigQuery,
  demoAccountsQuery,
  roleHome,
  roleLabel,
  signIn,
  type Credentials,
} from '@/features/session/queries';
import { SkipLink } from '@/layouts/shared';

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

function useSignIn() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(queryClient, credentials),
    onSuccess: async (session) => {
      const home = roleHome[session.user.role];
      await navigate({ to: redirect?.startsWith(home) ? redirect : home });
    },
  });
}

function PasswordForm() {
  const mutation = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ email, password });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="sign-in-email">Email</Label>
        <Input
          id="sign-in-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="sign-in-password">Password</Label>
          <Link
            to="/forgot-password"
            search={{ email: email || undefined }}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <div className="relative">
          <Input
            id="sign-in-password"
            type={visible ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
            <span className="sr-only">
              {visible ? 'Hide password' : 'Show password'}
            </span>
          </Button>
        </div>
      </div>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

/** Planned providers are shown honestly: what they would do, and that they are not connected. */
function ProviderButton({
  provider,
}: {
  provider: AuthConfig['providers'][number];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <Landmark aria-hidden="true" />
          Sign in with {provider.name}
          {provider.status === 'planned' && (
            <Badge variant="secondary" className="ml-1">
              Planned
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with {provider.name}: planned</DialogTitle>
          <DialogDescription>{provider.description}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            People would confirm who they are with {provider.name}; no national
            ID number is stored here.
          </li>
          <li>
            The first time, the {provider.name} account is linked to the
            platform account the administrator created for the same email.
          </li>
          <li>
            Roles, institutions and deactivation stay under the
            administrator’s control.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Until then, sign in with your email and password.
        </p>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function DemoAccounts({ config }: { config: AuthConfig }) {
  const accounts = useQuery(demoAccountsQuery);
  const mutation = useSignIn();
  const pendingId =
    mutation.isPending && mutation.variables && 'accountId' in mutation.variables
      ? mutation.variables.accountId
      : null;
  return (
    <section
      aria-labelledby="demo-heading"
      className="grid gap-5 rounded-2xl border border-secondary-foreground/15 bg-secondary/40 p-5 sm:p-6"
    >
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          Demonstration only
        </p>
        <h2 id="demo-heading" className="mt-2 text-lg font-semibold">
          Explore with a demonstration account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every institution, person and record here is fictional. Pick a role to
          sign in with one click, no password needed.
          {config.demoPassword && (
            <>
              {' '}
              To try the sign-in form instead, use a demo email with the
              password{' '}
              <code className="rounded bg-card px-1 py-0.5 text-xs font-medium text-foreground">
                {config.demoPassword}
              </code>
              .
            </>
          )}
        </p>
      </div>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <QueryView query={accounts} label="demo accounts">
        {(list) => (
          <div className="grid gap-4 md:grid-cols-2">
            {roleOrder.map(({ role, icon: Icon, description }) => {
              const group = list.filter((account) => account.role === role);
              if (group.length === 0) return null;
              return (
                <section
                  key={role}
                  aria-labelledby={`role-${role}`}
                  className="rounded-xl border bg-card p-4"
                >
                  <h3
                    id={`role-${role}`}
                    className="flex items-center gap-2 font-semibold"
                  >
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                    {roleLabel[role]}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </p>
                  <ul className="mt-3 grid gap-2">
                    {group.map((account: DemoAccount) => (
                      <li key={account.id}>
                        <button
                          type="button"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({ accountId: account.id })
                          }
                          className="group flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                        >
                          <span>
                            <span className="font-medium">
                              {account.displayName}
                            </span>
                            {account.institutionName ? (
                              <span className="block text-xs text-muted-foreground">
                                <span className="sr-only">, </span>
                                {account.institutionName}
                              </span>
                            ) : (
                              account.institutionId && (
                                <span className="sr-only">
                                  , institution {account.institutionId}
                                </span>
                              )
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-primary">
                            {pendingId === account.id
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
    </section>
  );
}

export function SignInPage() {
  const config = useQuery(authConfigQuery);
  return (
    <div className="min-h-svh bg-background">
      <SkipLink />
      <header className="border-b bg-card px-6 py-4">
        <Brand />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="outline-none mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start"
      >
        <section
          aria-labelledby="sign-in-heading"
          className="grid gap-6 rounded-2xl border bg-card p-6 shadow-xs lg:sticky lg:top-6"
        >
          <div>
            <h1
              id="sign-in-heading"
              className="text-2xl font-semibold tracking-tight"
            >
              Sign in
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Corruption prevention reporting and review.
            </p>
          </div>
          <PasswordForm />
          {config.data && config.data.providers.length > 0 && (
            <>
              <div
                className="flex items-center gap-3 text-xs text-muted-foreground"
                role="separator"
                aria-label="or"
              >
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2">
                {config.data.providers.map((provider) => (
                  <ProviderButton key={provider.id} provider={provider} />
                ))}
              </div>
            </>
          )}
          <p className="text-sm text-muted-foreground">
            New to the platform? Your administrator sends you an invitation by
            email to set your password.
          </p>
        </section>
        {config.data?.demoAccounts && <DemoAccounts config={config.data} />}
      </main>
    </div>
  );
}
