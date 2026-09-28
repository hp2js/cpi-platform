import {
  auditEventsSchema,
  deliveriesSchema,
  inboxSchema,
} from '@cpi/contracts';
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { request } from '@/lib/api';

export const eventKeys = {
  inbox: ['inbox'] as const,
  deliveries: (status: string | null) => ['deliveries', { status }] as const,
  emailSink: ['email-sink'] as const,
  audit: (objectType: string | null) => ['audit', { objectType }] as const,
};

export const inboxQuery = queryOptions({
  queryKey: eventKeys.inbox,
  queryFn: ({ signal }) =>
    request('/api/notifications', inboxSchema, { signal }),
  refetchInterval: 30_000,
});

export const markRead = (id: string) =>
  request(`/api/notifications/${encodeURIComponent(id)}/read`, z.undefined(), {
    method: 'POST',
  });
export const markAllRead = () =>
  request('/api/notifications/read-all', z.undefined(), { method: 'POST' });

export const deliveriesQuery = (status: string | null) =>
  queryOptions({
    queryKey: eventKeys.deliveries(status),
    queryFn: ({ signal }) =>
      request(
        status
          ? `/api/admin/deliveries?status=${status}`
          : '/api/admin/deliveries',
        deliveriesSchema,
        { signal },
      ),
  });

export const emailSinkSchema = z.array(
  z.object({
    id: z.string(),
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    deliveredAt: z.string(),
  }),
);
export const emailSinkQuery = queryOptions({
  queryKey: eventKeys.emailSink,
  queryFn: ({ signal }) =>
    request('/api/admin/email-sink', emailSinkSchema, { signal }),
});

export const retryDelivery = (id: string) =>
  request(
    `/api/admin/deliveries/${encodeURIComponent(id)}/retry`,
    z.object({ status: z.string() }),
    { method: 'POST' },
  );

export const auditQuery = (objectType: string | null) =>
  queryOptions({
    queryKey: eventKeys.audit(objectType),
    queryFn: ({ signal }) =>
      request(
        objectType ? `/api/audit?objectType=${objectType}` : '/api/audit',
        auditEventsSchema,
        { signal },
      ),
  });

/** Most actions create notifications and audit records; refresh those views after writes. */
export async function invalidateEvents(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: eventKeys.inbox }),
    queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
    queryClient.invalidateQueries({ queryKey: ['audit'] }),
  ]);
}
