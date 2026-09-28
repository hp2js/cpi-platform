import {
  assignmentHistorySchema,
  scenarioResultSchema,
  simulationStateSchema,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const simulationKeys = {
  state: ['simulation'] as const,
  assignments: ['assignments', 'history'] as const,
};

export const simulationQuery = queryOptions({
  queryKey: simulationKeys.state,
  queryFn: ({ signal }) =>
    request('/api/simulation', simulationStateSchema, { signal }),
});
export const assignmentHistoryQuery = queryOptions({
  queryKey: simulationKeys.assignments,
  queryFn: ({ signal }) =>
    request('/api/assignments/history', assignmentHistorySchema, { signal }),
});

export const advanceClock = (boundaryId: string) =>
  request('/api/simulation/advance', simulationStateSchema, {
    method: 'POST',
    json: { boundaryId },
  });
export const resetRun = () =>
  request('/api/simulation/reset', simulationStateSchema, { method: 'POST' });
export const runScenario = () =>
  request('/api/simulation/scenario', scenarioResultSchema, {
    method: 'POST',
    timeoutMs: 120_000,
  });
export const reassign = (
  institutionId: string,
  officerId: string,
  reason: string,
  suggestionId?: string,
) =>
  request('/api/assignments', z.object({ ok: z.boolean() }), {
    method: 'POST',
    json: { institutionId, officerId, reason, suggestionId },
  });

/** Business time and run changes affect every screen: refetch everything, including the session clock. */
export async function refreshAfterClockChange(queryClient: QueryClient) {
  await queryClient.invalidateQueries();
}
