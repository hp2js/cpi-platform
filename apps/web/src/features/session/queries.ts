import {
  authConfigSchema,
  authTokenSchema,
  demoAccountsSchema,
  sessionSchema,
  signInChallengeSchema,
  type PasswordSignIn,
  type Role,
  type Session,
  type SignInChallenge,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const sessionKeys = {
  session: ['session'] as const,
  accounts: ['session', 'demo-accounts'] as const,
};

export const sessionQuery = queryOptions({
  queryKey: sessionKeys.session,
  queryFn: ({ signal }) => request('/api/session', sessionSchema, { signal }),
  staleTime: 60_000,
  retry: false,
});

export const demoAccountsQuery = queryOptions({
  queryKey: sessionKeys.accounts,
  queryFn: ({ signal }) =>
    request('/api/demo/accounts', demoAccountsSchema, { signal }),
});

export const authConfigQuery = queryOptions({
  queryKey: ['auth', 'config'],
  queryFn: ({ signal }) =>
    request('/api/auth/config', authConfigSchema, { signal }),
  staleTime: Infinity,
});

/** A demonstration account ID, or an email and password. */
export type Credentials = { accountId: string } | PasswordSignIn;

/**
 * Demo sign-in answers with a session. A right email and password answers with a challenge:
 * the session starts once the emailed code is confirmed with `confirmSignInCode`.
 */
export async function signIn(
  queryClient: QueryClient,
  credentials: Credentials | string,
): Promise<Session | SignInChallenge> {
  const result = await request(
    '/api/session',
    z.union([sessionSchema, signInChallengeSchema]),
    {
      method: 'POST',
      json:
        typeof credentials === 'string'
          ? { accountId: credentials }
          : credentials,
    },
  );
  if ('challengeId' in result) return result;
  adoptSession(queryClient, result);
  return result;
}

export async function confirmSignInCode(
  queryClient: QueryClient,
  challengeId: string,
  code: string,
) {
  const session = await request('/api/session/code', sessionSchema, {
    method: 'POST',
    json: { challengeId, code },
  });
  adoptSession(queryClient, session);
  return session;
}

/** Stores a new session, dropping everything cached for the previous identity first. */
export function adoptSession(queryClient: QueryClient, session: Session) {
  queryClient.clear();
  queryClient.setQueryData(sessionKeys.session, session);
}

export const requestPasswordReset = (email: string) =>
  request('/api/auth/password-reset', z.object({ message: z.string() }), {
    method: 'POST',
    json: { email },
  });

export const authTokenQuery = (token: string) =>
  queryOptions({
    queryKey: ['auth', 'token', token],
    queryFn: ({ signal }) =>
      request(
        `/api/auth/tokens/${encodeURIComponent(token)}`,
        authTokenSchema,
        {
          signal,
        },
      ),
    retry: false,
  });

export const setPasswordWithToken = (token: string, password: string) =>
  request(`/api/auth/tokens/${encodeURIComponent(token)}`, sessionSchema, {
    method: 'POST',
    json: { password },
  });

/** `currentPassword` is left out when replacing the emailed temporary password. */
export const changePassword = (
  currentPassword: string | undefined,
  newPassword: string,
) =>
  request('/api/account/password', z.undefined(), {
    method: 'POST',
    json: { currentPassword, newPassword },
  });

export async function signOut(queryClient: QueryClient) {
  try {
    await request('/api/session', z.undefined(), { method: 'DELETE' });
  } finally {
    queryClient.clear();
  }
}

export const roleHome = {
  institution: '/institution',
  officer: '/officer',
  supervisor: '/supervisor',
  administrator: '/admin',
} as const satisfies Record<Role, string>;

export const roleLabel: Record<Role, string> = {
  institution: 'Institution focal person',
  officer: 'Prevention officer',
  supervisor: 'Supervisor',
  administrator: 'Administrator',
};
