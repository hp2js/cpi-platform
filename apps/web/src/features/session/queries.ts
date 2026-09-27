import {
  authConfigSchema,
  authTokenSchema,
  demoAccountsSchema,
  sessionSchema,
  type PasswordSignIn,
  type Role,
  type Session,
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

export async function signIn(
  queryClient: QueryClient,
  credentials: Credentials | string,
): Promise<Session> {
  const session = await request('/api/session', sessionSchema, {
    method: 'POST',
    json:
      typeof credentials === 'string'
        ? { accountId: credentials }
        : credentials,
  });
  // Drop everything cached for the previous identity before storing the new session.
  queryClient.clear();
  queryClient.setQueryData(sessionKeys.session, session);
  return session;
}

/** Stores a session obtained another way (e.g. setting a password from an emailed link). */
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
      request(`/api/auth/tokens/${encodeURIComponent(token)}`, authTokenSchema, {
        signal,
      }),
    retry: false,
  });

export const setPasswordWithToken = (token: string, password: string) =>
  request(`/api/auth/tokens/${encodeURIComponent(token)}`, sessionSchema, {
    method: 'POST',
    json: { password },
  });

export const changePassword = (currentPassword: string, newPassword: string) =>
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
