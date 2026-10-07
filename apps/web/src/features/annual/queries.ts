import {
  annualEvaluationSchema,
  annualOverviewSchema,
  consolidatedReportSchema,
  institutionResultsSchema,
  type ExtensionRequest,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const annualKeys = {
  overview: ['annual'] as const,
  report: ['annual', 'report'] as const,
  results: ['results'] as const,
};

export const annualQuery = queryOptions({
  queryKey: annualKeys.overview,
  queryFn: ({ signal }) =>
    request('/api/annual', annualOverviewSchema, { signal }),
});
export const consolidatedReportQuery = queryOptions({
  queryKey: annualKeys.report,
  queryFn: ({ signal }) =>
    request('/api/annual/report', consolidatedReportSchema, { signal }),
});
export const resultsQuery = queryOptions({
  queryKey: annualKeys.results,
  queryFn: ({ signal }) =>
    request('/api/results', institutionResultsSchema, { signal }),
});

export const publishResults = (institutionIds: string[]) =>
  request('/api/annual/publish', annualOverviewSchema, {
    method: 'POST',
    json: { institutionIds },
  });
export const openCorrection = (
  institutionId: string,
  periodId: string,
  reason: string,
) =>
  request('/api/annual/corrections', annualOverviewSchema, {
    method: 'POST',
    json: { institutionId, periodId, reason },
  });
export const closeNonresponse = (obligationId: string, reason: string) =>
  request(
    `/api/obligations/${encodeURIComponent(obligationId)}/close-nonresponse`,
    z.unknown(),
    { method: 'POST', json: { reason } },
  );

/** Annual state depends on every review action; refresh it alongside the queues. */
export async function invalidateAnnual(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['annual'] }),
    queryClient.invalidateQueries({ queryKey: ['results'] }),
    queryClient.invalidateQueries({ queryKey: ['oversight'] }),
    queryClient.invalidateQueries({ queryKey: ['obligations'] }),
  ]);
}

/** Downloads a scoped export through the authenticated API, never a public storage URL. */
export async function downloadExport(path: `/api/${string}`, fileName: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('The export could not be generated.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export const recordExtension = (extension: ExtensionRequest) =>
  request('/api/annual/extensions', annualEvaluationSchema, {
    method: 'POST',
    json: extension,
  });
