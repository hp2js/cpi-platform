import {
  assignmentsSchema,
  cycleSchema,
  institutionSchema,
  institutionsSchema,
  obligationsSchema,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { request } from '@/lib/api';

export const directoryKeys = {
  cycle: ['cycle', 'current'] as const,
  institutions: ['institutions'] as const,
  institution: (id: string) => ['institutions', id] as const,
  obligations: (institutionId?: string) =>
    ['obligations', { institutionId: institutionId ?? null }] as const,
  assignments: ['assignments'] as const,
};

export const cycleQuery = queryOptions({
  queryKey: directoryKeys.cycle,
  queryFn: ({ signal }) =>
    request('/api/cycles/current', cycleSchema, { signal }),
  staleTime: 5 * 60_000,
});

export const institutionsQuery = queryOptions({
  queryKey: directoryKeys.institutions,
  queryFn: ({ signal }) =>
    request('/api/institutions', institutionsSchema, { signal }),
});

export const institutionQuery = (id: string) =>
  queryOptions({
    queryKey: directoryKeys.institution(id),
    queryFn: ({ signal }) =>
      request(
        `/api/institutions/${encodeURIComponent(id)}`,
        institutionSchema,
        { signal },
      ),
  });

export const obligationsQuery = (institutionId?: string) =>
  queryOptions({
    queryKey: directoryKeys.obligations(institutionId),
    queryFn: ({ signal }) =>
      request(
        institutionId
          ? `/api/obligations?institutionId=${encodeURIComponent(institutionId)}`
          : '/api/obligations',
        obligationsSchema,
        { signal },
      ),
  });

export const assignmentsQuery = queryOptions({
  queryKey: directoryKeys.assignments,
  queryFn: ({ signal }) =>
    request('/api/assignments', assignmentsSchema, { signal }),
});
