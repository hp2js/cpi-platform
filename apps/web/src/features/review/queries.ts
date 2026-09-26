import {
  type ClarificationRequest,
  reviewBundleSchema,
  reviewQueueSchema,
  type DecisionRequest,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { request } from '@/lib/api';

export type QueueStatus = 'open' | 'finalized';

export const reviewKeys = {
  queue: (status: QueueStatus) => ['reviews', 'queue', status] as const,
  detail: (submissionId: string) => ['reviews', submissionId] as const,
};

export const reviewQueueQuery = (status: QueueStatus) =>
  queryOptions({
    queryKey: reviewKeys.queue(status),
    queryFn: ({ signal }) =>
      request(`/api/reviews?status=${status}`, reviewQueueSchema, { signal }),
  });

export const reviewQuery = (submissionId: string) =>
  queryOptions({
    queryKey: reviewKeys.detail(submissionId),
    queryFn: ({ signal }) =>
      request(
        `/api/reviews/${encodeURIComponent(submissionId)}`,
        reviewBundleSchema,
        { signal },
      ),
  });

export const recordDecision = (
  submissionId: string,
  milestoneCode: string,
  decision: DecisionRequest,
) =>
  request(
    `/api/reviews/${encodeURIComponent(submissionId)}/decisions/${encodeURIComponent(milestoneCode)}`,
    reviewBundleSchema,
    {
      method: 'PUT',
      json: decision,
    },
  );

export const finalizeReview = (submissionId: string, revision: number) =>
  request(
    `/api/reviews/${encodeURIComponent(submissionId)}/finalize`,
    reviewBundleSchema,
    { method: 'POST', json: { revision } },
  );

export async function invalidateReviews(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['reviews', 'queue'] }),
    queryClient.invalidateQueries({ queryKey: ['obligations'] }),
  ]);
}

export const carryForward = (
  submissionId: string,
  milestoneCode: string,
  revision: number,
) =>
  request(
    `/api/reviews/${encodeURIComponent(submissionId)}/decisions/${encodeURIComponent(milestoneCode)}/carry-forward`,
    reviewBundleSchema,
    {
      method: 'POST',
      json: { revision },
    },
  );

export const requestClarification = (
  submissionId: string,
  clarification: ClarificationRequest,
) =>
  request(
    `/api/reviews/${encodeURIComponent(submissionId)}/clarifications`,
    reviewBundleSchema,
    { method: 'POST', json: clarification },
  );

export const reopenReview = (submissionId: string, reason: string) =>
  request(
    `/api/reviews/${encodeURIComponent(submissionId)}/reopen`,
    reviewBundleSchema,
    { method: 'POST', json: { reason } },
  );
