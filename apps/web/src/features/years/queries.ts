import {
  closedYearResultsSchema,
  financialYearSchema,
  financialYearsSchema,
  type FinancialYearCreate,
  type FinancialYearUpdate,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

/** Financial years (HP2-100): the active one and the next one planned ahead. */
export const yearsKeys = { all: ['financial-years'] as const };

export const yearsQuery = queryOptions({
  queryKey: yearsKeys.all,
  queryFn: ({ signal }) =>
    request('/api/financial-years', financialYearsSchema, { signal }),
});

export const planYear = (input: FinancialYearCreate) =>
  request('/api/financial-years', financialYearsSchema, {
    method: 'POST',
    json: input,
  });

export const updateYear = (id: string, input: FinancialYearUpdate) =>
  request(
    `/api/financial-years/${encodeURIComponent(id)}`,
    financialYearsSchema,
    { method: 'PUT', json: input },
  );

export const discardYear = (id: string, reason: string) =>
  request(
    `/api/financial-years/${encodeURIComponent(id)}/discard`,
    financialYearsSchema,
    { method: 'POST', json: { reason } },
  );

export const openYear = (id: string, reason: string, leavePending: boolean) =>
  request(
    `/api/financial-years/${encodeURIComponent(id)}/open`,
    financialYearsSchema,
    { method: 'POST', json: { reason, leavePending } },
  );

/** Closed years, for looking back at earlier results (any role). */
export const closedYearsQuery = queryOptions({
  queryKey: [...yearsKeys.all, 'closed'] as const,
  queryFn: ({ signal }) =>
    request('/api/financial-years/closed', z.array(financialYearSchema), {
      signal,
    }),
});

/** A closed year's published results within the reader's scope. */
export const closedResultsQuery = (yearId: string) =>
  queryOptions({
    queryKey: [...yearsKeys.all, 'closed', yearId, 'results'] as const,
    queryFn: ({ signal }) =>
      request(
        `/api/financial-years/${encodeURIComponent(yearId)}/results`,
        closedYearResultsSchema,
        { signal },
      ),
  });
