import {
  completenessSchema,
  draftSchema,
  evidenceItemSchema,
  receiptSchema,
  receiptsSchema,
  reportBundleSchema,
  type Attestation,
  type ReportAnswers,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';
import { uploadWithProgress } from '@/lib/upload';

/** Obligation IDs combine institution and period, e.g. DEMO-001:FY2026-27-Q1. */
export const obligationIdFor = (institutionId: string, periodId: string) =>
  `${institutionId}:${periodId}`;
const path = (obligationId: string) =>
  `/api/obligations/${encodeURIComponent(obligationId)}` as const;

export const reportKeys = {
  bundle: (obligationId: string) => ['reports', obligationId] as const,
  completeness: (obligationId: string) =>
    ['reports', obligationId, 'completeness'] as const,
  receipts: ['receipts'] as const,
  receipt: (id: string) => ['receipts', id] as const,
};

export const reportQuery = (obligationId: string) =>
  queryOptions({
    queryKey: reportKeys.bundle(obligationId),
    queryFn: ({ signal }) =>
      request(`${path(obligationId)}/report`, reportBundleSchema, { signal }),
  });

export const completenessQuery = (obligationId: string) =>
  queryOptions({
    queryKey: reportKeys.completeness(obligationId),
    queryFn: ({ signal }) =>
      request(`${path(obligationId)}/completeness`, completenessSchema, {
        signal,
      }),
    staleTime: 0,
  });

export const receiptsQuery = queryOptions({
  queryKey: reportKeys.receipts,
  queryFn: ({ signal }) => request('/api/receipts', receiptsSchema, { signal }),
});

export const receiptQuery = (id: string) =>
  queryOptions({
    queryKey: reportKeys.receipt(id),
    queryFn: ({ signal }) =>
      request(`/api/receipts/${encodeURIComponent(id)}`, receiptSchema, {
        signal,
      }),
  });

export const saveDraft = (
  obligationId: string,
  baseVersion: number,
  answers: ReportAnswers,
) =>
  request(`${path(obligationId)}/draft`, draftSchema, {
    method: 'PUT',
    json: { baseVersion, answers },
  });

/** Uploads a file (optionally replacing an earlier version) with progress reporting. */
export const uploadEvidence = (
  obligationId: string,
  file: File,
  category: string,
  onProgress?: (fraction: number) => void,
  replaces?: string,
) => {
  const body = new FormData();
  body.append('file', file);
  body.append('category', category);
  if (replaces) body.append('replaces', replaces);
  return uploadWithProgress(
    `${path(obligationId)}/evidence`,
    body,
    evidenceItemSchema,
    onProgress,
  );
};

/** The idempotency key is reused on retry so a timed-out submit cannot create a second revision. */
export const submitReport = (
  obligationId: string,
  idempotencyKey: string,
  draftVersion: number,
  attestation: Attestation,
) =>
  request(`${path(obligationId)}/submit`, receiptSchema, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    json: { draftVersion, attestation },
  });

export async function invalidateReport(
  queryClient: QueryClient,
  obligationId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: reportKeys.bundle(obligationId),
    }),
    queryClient.invalidateQueries({ queryKey: reportKeys.receipts }),
    queryClient.invalidateQueries({ queryKey: ['obligations'] }),
  ]);
}
