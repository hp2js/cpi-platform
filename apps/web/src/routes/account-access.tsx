import { passwordProblems, PASSWORD_MIN_LENGTH } from '@cpi/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { Check, Circle, Eye, EyeOff, KeyRound, MailCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  adoptSession,
  authTokenQuery,
  requestPasswordReset,
  roleHome,
  setPasswordWithToken,
} from '@/features/session/queries';
import { isApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { SkipLink } from '@/layouts/shared';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SkipLink />
      <header className="border-b bg-card px-6 py-4">
        <Brand />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="outline-none mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6"
      >
        <div className="grid gap-5 rounded-2xl border bg-card p-6 shadow-xs">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * A password field with the shared rules shown as a live checklist (NIST SP 800-63B: length,
 * not common, not the email; paste and password managers allowed).
 */
export function NewPasswordField({
  id,
  label,
  value,
  onChange,
  email,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  email: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const problems = passwordProblems(value, email);
  const rules = [
    [
      `At least ${PASSWORD_MIN_LENGTH} characters`,
      value.length >= PASSWORD_MIN_LENGTH,
    ],
    [
      'Not a common password',
      !problems.includes('Choose a less common password.'),
    ],
    [
      'Does not include your email',
      !problems.includes('Do not include your email address.'),
    ],
  ] as const;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-rules`}
          aria-invalid={error ? true : undefined}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span className="sr-only">
            {visible ? 'Hide password' : 'Show password'}
          </span>
        </Button>
      </div>
      <ul id={`${id}-rules`} className="grid gap-0.5 text-sm">
        {rules.map(([rule, met]) => (
          <li
            key={rule}
            className={
              met && value
                ? 'flex items-center gap-1.5'
                : 'flex items-center gap-1.5 text-muted-foreground'
            }
          >
            {met && value ? (
              <Check className="size-4 text-primary" aria-hidden="true" />
            ) : (
              <Circle className="size-3.5" aria-hidden="true" />
            )}
            {rule}
            <span className="sr-only">
              {met && value ? ': met' : ': not yet'}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        A passphrase of a few words is easy to remember. Pasting from a password
        manager is fine.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const forgotRoute = getRouteApi('/forgot-password');

export function ForgotPasswordPage() {
  const { email: initial } = forgotRoute.useSearch();
  const [email, setEmail] = useState(initial ?? '');
  const mutation = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
  });
  return (
    <Shell title="Reset your password">
      {mutation.isSuccess ? (
        <div className="grid gap-4">
          <p role="status" className="flex items-start gap-2">
            <MailCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {mutation.data.message}
          </p>
          <p className="text-sm text-muted-foreground">
            In this demonstration, emails go to the demo email sink, which the
            administrator can open under Notifications.
          </p>
          <Link
            to="/sign-in"
            search={{ redirect: undefined }}
            className={buttonVariants({ variant: 'outline' })}
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Enter the email you sign in with. If it belongs to an account, we
            send a link to choose a new password.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <Button type="submit" disabled={!email.trim() || mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link
            to="/sign-in"
            search={{ redirect: undefined }}
            className="text-center text-sm text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </form>
      )}
    </Shell>
  );
}

const setRoute = getRouteApi('/set-password');

/** From an invitation or reset email: choose a password, then continue signed in. */
export function SetPasswordPage() {
  const { token = '' } = setRoute.useSearch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const link = useQuery({ ...authTokenQuery(token), enabled: Boolean(token) });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mutation = useMutation({
    mutationFn: () => setPasswordWithToken(token, password),
    onSuccess: async (session) => {
      adoptSession(queryClient, session);
      await navigate({ to: roleHome[session.user.role] });
    },
  });
  const errors = isApiError(mutation.error) ? mutation.error.fieldErrors : {};

  if (!token || link.isError)
    return (
      <Shell title="This link cannot be used">
        <Alert variant="destructive">
          <AlertTitle>
            {isApiError(link.error, 410)
              ? 'The link has expired'
              : 'The link is not valid'}
          </AlertTitle>
          <AlertDescription>
            {isApiError(link.error, 410)
              ? 'Invitation links last 7 days and reset links 1 hour.'
              : 'It may already have been used, or a newer link replaced it.'}{' '}
            Ask your administrator for a new invitation, or request a new reset
            link.
          </AlertDescription>
        </Alert>
        <Link
          to="/forgot-password"
          search={{ email: undefined }}
          className={buttonVariants({ variant: 'outline' })}
        >
          Request a reset link
        </Link>
      </Shell>
    );
  if (!link.data)
    return (
      <Shell title="Checking your link">
        <p role="status" className="text-muted-foreground">
          One moment…
        </p>
      </Shell>
    );

  const invitation = link.data.purpose === 'invitation';
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <Shell title={invitation ? 'Set up your account' : 'Choose a new password'}>
      <p className="flex items-start gap-2 text-sm">
        <KeyRound
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>
          {invitation ? `Welcome, ${link.data.displayName}. ` : ''}
          You will sign in as <strong>{link.data.email}</strong>. This link
          works once and expires {formatDateTime(link.data.expiresAt)}.
        </span>
      </p>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!mismatch) mutation.mutate();
        }}
      >
        {/* Lets password managers save the new password against the right account. */}
        <input
          type="email"
          autoComplete="username"
          value={link.data.email}
          readOnly
          hidden
        />
        <NewPasswordField
          id="new-password"
          label={invitation ? 'Password' : 'New password'}
          value={password}
          onChange={setPassword}
          email={link.data.email}
          error={errors.password}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">Confirm the password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={mismatch || undefined}
          />
          {mismatch && (
            <p className="text-sm text-destructive">
              The passwords do not match.
            </p>
          )}
        </div>
        {mutation.isError && Object.keys(errors).length === 0 && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={
            passwordProblems(password, link.data.email).length > 0 ||
            confirm !== password ||
            mutation.isPending
          }
        >
          {mutation.isPending
            ? 'Saving…'
            : invitation
              ? 'Set password and sign in'
              : 'Save password and sign in'}
        </Button>
      </form>
    </Shell>
  );
}
