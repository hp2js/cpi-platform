import {
  baselineSchema,
  planImportPreviewSchema,
  planImportResultSchema,
  planSchema,
  type ActivityRequest,
  type AmendmentRequest,
  type BaselineCheck,
  type BaselineChecks,
  type PlanApprovalRequest,
  type PlannedMilestoneRequest,
  type RiskRequest,
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
export const returnBaseline = (
  id: string,
  version: number,
  reason: string,
  failedChecks: BaselineCheck[],
) =>
  request(`${baselinePath(id)}/return`, baselineSchema, {
    method: 'POST',
    json: { version, reason, failedChecks },
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

const planPath = (institutionId: string) =>
  `/api/institutions/${encodeURIComponent(institutionId)}` as const;

/** The plan items the institution edits, each a collection under its institution. */
export type PlanCollection = 'risks' | 'activities' | 'plan-milestones';
type PlanItemRequest = {
  risks: RiskRequest;
  activities: ActivityRequest;
  'plan-milestones': PlannedMilestoneRequest;
};

export const savePlanItem = <C extends PlanCollection>(
  institutionId: string,
  collection: C,
  id: string | null,
  item: PlanItemRequest[C],
) =>
  request(
    `${planPath(institutionId)}/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`,
    planSchema,
    { method: id ? 'PUT' : 'POST', json: item },
  );
export const removePlanItem = (
  institutionId: string,
  collection: PlanCollection,
  id: string,
) =>
  request(
    `${planPath(institutionId)}/${collection}/${encodeURIComponent(id)}`,
    planSchema,
    { method: 'DELETE' },
  );
export const savePlanApproval = (
  institutionId: string,
  approval: PlanApprovalRequest,
) =>
  request(`${planPath(institutionId)}/plan/approval`, planSchema, {
    method: 'PUT',
    json: approval,
  });
export const proposeBaseline = (
  institutionId: string,
  periodId: string,
  note: string,
) =>
  request(
    `${planPath(institutionId)}/baselines/${encodeURIComponent(periodId)}/propose`,
    planSchema,
    { method: 'POST', json: { note } },
  );
export const previewPlanImport = (institutionId: string, csv: string) =>
  request(
    `${planPath(institutionId)}/plan/import/preview`,
    planImportPreviewSchema,
    {
      method: 'POST',
      json: { csv },
    },
  );
export const importPlan = (institutionId: string, csv: string) =>
  request(`${planPath(institutionId)}/plan/import`, planImportResultSchema, {
    method: 'POST',
    json: { csv },
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
