import {
  demoAccountsSchema,
  sessionSchema,
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

export async function signIn(
  queryClient: QueryClient,
  accountId: string,
): Promise<Session> {
  const session = await request('/api/session', sessionSchema, {
    method: 'POST',
    json: { accountId },
  });
  // Drop everything cached for the previous identity before storing the new session.
  queryClient.clear();
  queryClient.setQueryData(sessionKeys.session, session);
  return session;
}

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
