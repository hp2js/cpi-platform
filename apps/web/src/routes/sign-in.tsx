import type { AuthConfig, DemoAccount, Role } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronRight,
  Copy,
  Building2,
  ClipboardList,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  Landmark,
  Search,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
      <div className="grid gap-2">
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
      <div className="grid gap-2">
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
            className="absolute top-1/2 right-0 size-touch -translate-y-1/2"
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
            Roles, institutions and deactivation stay under the administrator’s
            control.
          </li>
        </ul>
        <p className="text-sm text-base-dark">
          Until then, sign in with your email and password.
        </p>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

/** One account in the demonstration list: the whole row signs in. */
function DemoAccountButton({
  account,
  pending,
  disabled,
  onSelect,
}: {
  account: DemoAccount;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      data-focus-inset
      className="group flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-primary-lighter focus-visible:relative disabled:cursor-not-allowed disabled:text-disabled-dark"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{account.displayName}</span>
        {account.institutionName ? (
          <span className="block truncate text-xs text-base-dark">
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
      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-primary">
        <span
          className={
            pending
              ? undefined
              : 'sr-only group-hover:not-sr-only group-focus-visible:not-sr-only'
          }
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </span>
        <ChevronRight
          className="size-4 text-base-dark transition-colors group-hover:text-primary"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}

function RoleGroup({
  role,
  icon: Icon,
  description,
  accounts,
  pendingId,
  disabled,
  onSelect,
}: (typeof roleOrder)[number] & {
  accounts: DemoAccount[];
  pendingId: string | null;
  disabled: boolean;
  onSelect: (accountId: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const searchable = accounts.length > 6;
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? accounts.filter((account) =>
        `${account.displayName} ${account.institutionName ?? ''} ${account.institutionId ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    : accounts;
  return (
    <section
      id={`demo-${role}`}
      aria-labelledby={`role-${role}`}
      className="grid scroll-mt-4 gap-2"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-warm text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 id={`role-${role}`} className="font-bold">
              {roleLabel[role]}
            </h3>
            <span className="rounded-sm bg-base-lightest px-2 py-1 text-xs font-bold text-base-dark">
              {accounts.length}
              <span className="sr-only">
                {accounts.length === 1 ? ' account' : ' accounts'}
              </span>
            </span>
          </div>
          <p className="text-sm text-base-dark">{description}</p>
        </div>
      </div>
      {searchable && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-base-dark"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={`Find a ${roleLabel[role].toLowerCase()} account`}
            placeholder="Filter by name or institution"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-10"
          />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="bg-base-lightest px-4 py-3 text-sm text-base-dark">
          No account matches “{filter.trim()}”.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-white">
          {shown.map((account) => (
            <li key={account.id}>
              <DemoAccountButton
                account={account}
                pending={pendingId === account.id}
                disabled={disabled}
                onSelect={() => onSelect(account.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CopyPassword({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-md border bg-white px-2 py-1 font-mono text-sm font-bold">
        {password}
      </code>
      <Button
        type="button"
        variant="plain"
        size="sm"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(password)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
        <span className="sr-only"> the demo password</span>
      </Button>
      <span role="status" className="sr-only">
        {copied ? 'Demo password copied' : ''}
      </span>
    </div>
  );
}

/**
 * Demonstration accounts live behind a floating button so the page reads as a real sign-in.
 * The open state is in the URL (`?demo=open`), so a demo can be linked to directly.
 */
function DemoAccounts({ config }: { config: AuthConfig }) {
  const { demo } = route.useSearch();
  const navigate = useNavigate({ from: '/sign-in' });
  const accounts = useQuery(demoAccountsQuery);
  const mutation = useSignIn();
  const pendingId =
    mutation.isPending &&
    mutation.variables &&
    'accountId' in mutation.variables
      ? mutation.variables.accountId
      : null;
  const setOpen = (open: boolean) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        demo: open ? 'open' : undefined,
      }),
      replace: !open,
    });
  return (
    <Sheet open={demo === 'open'} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="lg"
          className="fixed bottom-4 left-4 z-40 h-touch rounded-md px-5 shadow-3 tablet:bottom-6 tablet:left-6"
        >
          <FlaskConical aria-hidden="true" />
          <span className="tablet:hidden">Demo accounts</span>
          <span className="hidden tablet:inline">
            Explore with a demonstration account
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 outline-none tablet:max-w-mobile-lg"
        // Start on the sheet itself: no keyboard popping up on phones, and Tab reaches the list.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <SheetHeader className="gap-1 border-b p-5 pr-12">
          <p className="inline-flex w-fit items-center gap-2 rounded-sm bg-warning-lighter px-2 py-1 text-xs font-bold text-ink">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            Demonstration only
          </p>
          <SheetTitle className="mt-1 text-lg">
            Explore with a demonstration account
          </SheetTitle>
          <SheetDescription>
            Choose who to be. Every institution, person and record is fictional;
            sign out at any time to switch.
          </SheetDescription>
          {accounts.data && (
            <nav aria-label="Roles" className="mt-2 flex flex-wrap gap-2">
              {roleOrder.map(({ role, icon: Icon }) => {
                const count = accounts.data.filter(
                  (account) => account.role === role,
                ).length;
                return count === 0 ? null : (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(`demo-${role}`)
                        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                    }
                    className="inline-flex min-h-touch items-center gap-2 rounded-md border border-base-dark bg-white px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary"
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {roleLabel[role]}
                    <span className="text-base-dark">{count}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-6 p-5">
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            )}
            <QueryView query={accounts} label="demo accounts">
              {(list) => (
                <>
                  {roleOrder.map((group) => {
                    const members = list.filter(
                      (account) => account.role === group.role,
                    );
                    return members.length === 0 ? null : (
                      <RoleGroup
                        key={group.role}
                        {...group}
                        accounts={members}
                        pendingId={pendingId}
                        disabled={mutation.isPending}
                        onSelect={(accountId) => mutation.mutate({ accountId })}
                      />
                    );
                  })}
                </>
              )}
            </QueryView>
          </div>
        </div>
        {config.demoPassword && (
          <div className="grid gap-2 border-t bg-base-lightest p-5 text-sm">
            <p>
              <span className="font-bold">Prefer the sign-in form?</span>{' '}
              <span className="text-base-dark">
                Every demo email above works with this password.
              </span>
            </p>
            <CopyPassword password={config.demoPassword} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function SignInPage() {
  const config = useQuery(authConfigQuery);
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SkipLink />
      <header className="border-b bg-white px-6 py-4">
        <Brand />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="outline-none mx-auto flex w-full max-w-mobile-lg flex-1 flex-col justify-center px-4 pt-10 pb-20 tablet:px-6"
      >
        <section
          aria-labelledby="sign-in-heading"
          className="grid gap-6 rounded-lg border bg-white p-6 tablet:p-8"
        >
          <div>
            <h1
              id="sign-in-heading"
              className="text-xl font-bold tracking-tight"
            >
              Sign in
            </h1>
            <p className="mt-1 text-sm text-base-dark">
              Corruption prevention reporting and review.
            </p>
          </div>
          <PasswordForm />
          {config.data && config.data.providers.length > 0 && (
            <>
              <div
                className="flex items-center gap-3 text-xs text-base-dark"
                role="separator"
                aria-label="or"
              >
                <span className="h-px flex-1 bg-base-lighter" />
                or
                <span className="h-px flex-1 bg-base-lighter" />
              </div>
              <div className="grid gap-2">
                {config.data.providers.map((provider) => (
                  <ProviderButton key={provider.id} provider={provider} />
                ))}
              </div>
            </>
          )}
          <p className="text-sm text-base-dark">
            New to the platform? Your administrator sends you an invitation by
            email to set your password.
          </p>
        </section>
      </main>
      {config.data?.demoAccounts && <DemoAccounts config={config.data} />}
    </div>
  );
}
