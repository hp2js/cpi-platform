import {
  institutionProfileSchema,
  type AccountingOfficer,
} from '@cpi/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const institutionProfileQuery = queryOptions({
  queryKey: ['institution-profile'] as const,
  queryFn: ({ signal }) =>
    request('/api/institution-profile', institutionProfileSchema, { signal }),
});

export const updateAccountingOfficer = (accountingOfficer: AccountingOfficer) =>
  request(
    '/api/institution-profile/accounting-officer',
    z.object({ ok: z.boolean() }),
    { method: 'PUT', json: accountingOfficer },
  );
