import {
  baselineSchema,
  planSchema,
  type AmendmentRequest,
  type BaselineChecks,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const planKeys = {
  plan: (institutionId: string) => ['plan', institutionId] as const,
};

export const planQuery = (institutionId: string) =>
  queryOptions({
    queryKey: planKeys.plan(institutionId),
    queryFn: ({ signal }) =>
      request(
        `/api/institutions/${encodeURIComponent(institutionId)}/plan`,
        planSchema,
        { signal },
      ),
  });

const baselinePath = (id: string) =>
  `/api/baselines/${encodeURIComponent(id)}` as const;

export const approveBaseline = (
  id: string,
  version: number,
  rationale: string,
  checks: BaselineChecks,
) =>
  request(`${baselinePath(id)}/approve`, baselineSchema, {
    method: 'POST',
    json: { version, rationale, checks },
  });
export const returnBaseline = (id: string, version: number, reason: string) =>
  request(`${baselinePath(id)}/return`, baselineSchema, {
    method: 'POST',
    json: { version, reason },
  });
export const confirmSeed = (id: string, version: number) =>
  request(`${baselinePath(id)}/confirm-seed`, baselineSchema, {
    method: 'POST',
    json: { version },
  });

export const requestAmendment = (
  institutionId: string,
  amendment: AmendmentRequest,
) =>
  request(
    `/api/institutions/${encodeURIComponent(institutionId)}/amendments`,
    z.object({ id: z.string() }),
    { method: 'POST', json: amendment },
  );
export const decideAmendment = (
  id: string,
  decision: 'confirmed' | 'declined',
  reason: string,
) =>
  request(`/api/amendments/${encodeURIComponent(id)}/decision`, planSchema, {
    method: 'POST',
    json: { decision, reason },
  });

export async function invalidatePlan(
  queryClient: QueryClient,
  institutionId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: planKeys.plan(institutionId) }),
    queryClient.invalidateQueries({ queryKey: ['reports'] }),
    queryClient.invalidateQueries({ queryKey: ['reviews'] }),
  ]);
}
