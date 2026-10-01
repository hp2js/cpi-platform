import { SkipLink } from '@/layouts/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { Clock, SearchX, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { buttonVariants } from '@/components/ui/button';
import { roleHome, sessionQuery } from '@/features/session/queries';

function SystemPage({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SkipLink />
      <header className="border-b bg-white px-6 py-4">
        <Brand />
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="outline-none mx-auto flex w-full max-w-mobile-lg flex-1 flex-col justify-center px-6 py-16"
      >
        <div className="text-primary" aria-hidden="true">
          {icon}
        </div>
        <h1 className="mt-4 text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-2 text-base-dark">{children}</div>
        <div className="mt-6">{action}</div>
      </main>
    </div>
  );
}

/** Where to send someone who is (possibly) still signed in. */
function HomeLink() {
  const session = useQuery({ ...sessionQuery, throwOnError: false });
  return session.data ? (
    <Link to={roleHome[session.data.user.role]} className={buttonVariants()}>
      Go to your home page
    </Link>
  ) : (
    <Link
      to="/sign-in"
      search={{ redirect: undefined }}
      className={buttonVariants()}
    >
      Sign in
    </Link>
  );
}

export function ForbiddenPage() {
  return (
    <SystemPage
      icon={<ShieldAlert className="size-10" />}
      title="You don't have access to this page"
      action={<HomeLink />}
    >
      Your account's role does not include this area. If you expected access,
      ask an administrator to check your role or assignment.
    </SystemPage>
  );
}

export function SessionExpiredPage() {
  return (
    <SystemPage
      icon={<Clock className="size-10" />}
      title="Your session has expired"
      action={
        <Link
          to="/sign-in"
          search={{ redirect: undefined }}
          className={buttonVariants()}
        >
          Sign in again
        </Link>
      }
    >
      For your security you were signed out. Saved drafts are kept; anything not
      yet saved on the page you were using may need to be entered again.
    </SystemPage>
  );
}

export function NotFoundPage() {
  return (
    <SystemPage
      icon={<SearchX className="size-10" />}
      title="Page not found"
      action={<HomeLink />}
    >
      The address may be mistyped, or the page may have moved.
    </SystemPage>
  );
}

export function RouteErrorPage({ error }: ErrorComponentProps) {
  return (
    <SystemPage
      icon={<TriangleAlert className="size-10" />}
      title="This page could not load"
      action={
        <button
          type="button"
          className={buttonVariants()}
          onClick={() => window.location.reload()}
        >
          Reload the page
        </button>
      }
    >
      <span role="alert">
        Something went wrong while loading. Reloading usually fixes it.
      </span>
      {import.meta.env.DEV && (
        <pre className="mt-4 overflow-auto rounded-md bg-base-lightest p-3 text-xs">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
    </SystemPage>
  );
}
