import { http, HttpResponse } from 'msw';
import type { AuditEvent, Delivery, Notification } from '@cpi/contracts';
import { commit, getDb } from '../db';
import { attemptDelivery, audit } from '../services/events';
import { apiError, notFound } from '../services/http';
import { networkDelay } from '../services/latency';
import { requireRole, requireUser } from '../services/session';

const toNotification = ({
  id,
  eventType,
  title,
  body,
  link,
  createdAt,
  readAt,
}: Notification): Notification => ({
  id,
  eventType,
  title,
  body,
  link,
  createdAt,
  readAt,
});

export const eventHandlers = [
  http.get('/api/notifications', async () => {
    await networkDelay();
    const user = requireUser();
    // Each user reads only their own inbox; links still pass through access checks.
    const items = getDb()
      .notifications.filter(
        (notification) => notification.recipientId === user.id,
      )
      .map(toNotification)
      .reverse();
    return HttpResponse.json({
      unread: items.filter((item) => !item.readAt).length,
      items,
    });
  }),
  http.post('/api/notifications/:notificationId/read', async ({ params }) => {
    await networkDelay();
    const user = requireUser();
    const notification = getDb().notifications.find(
      (candidate) =>
        candidate.id === params.notificationId &&
        candidate.recipientId === user.id,
    );
    if (!notification) return notFound();
    commit((db) => {
      notification.readAt ??= db.businessTime;
    });
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/notifications/read-all', async () => {
    await networkDelay();
    const user = requireUser();
    commit((db) => {
      for (const notification of db.notifications)
        if (notification.recipientId === user.id)
          notification.readAt ??= db.businessTime;
    });
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/admin/deliveries', async ({ request }) => {
    await networkDelay();
    requireRole('administrator');
    const status = new URL(request.url).searchParams.get('status');
    const deliveries: Delivery[] = getDb()
      .deliveries.filter((delivery) => !status || delivery.status === status)
      .map(
        ({
          id,
          eventType,
          recipientName,
          recipientEmail,
          subject,
          status: state,
          attempts,
          lastAttemptAt,
          lastError,
        }) => ({
          id,
          eventType,
          recipientName,
          recipientEmail,
          subject,
          status: state,
          attempts,
          lastAttemptAt,
          lastError,
        }),
      )
      .reverse();
    return HttpResponse.json(deliveries);
  }),
  http.post('/api/admin/deliveries/:deliveryId/retry', async ({ params }) => {
    await networkDelay();
    const user = requireRole('administrator');
    const delivery = getDb().deliveries.find(
      (candidate) => candidate.id === params.deliveryId,
    );
    if (!delivery) return notFound();
    if (delivery.status === 'delivered')
      return apiError(
        409,
        'This message was already delivered.',
        'already_delivered',
      );
    commit((db) => {
      const delivered = attemptDelivery(db, delivery);
      if (!delivered) delivery.status = 'failed';
      audit(
        db,
        user,
        'delivery.retry',
        { type: 'delivery', id: delivery.id, version: delivery.attempts },
        delivered ? 'Delivered on manual retry' : 'Manual retry failed',
      );
    });
    return HttpResponse.json({ status: delivery.status });
  }),
  http.get('/api/admin/email-sink', async () => {
    await networkDelay();
    requireRole('administrator');
    return HttpResponse.json([...getDb().emailSink].reverse());
  }),
  http.get('/api/audit', async ({ request }) => {
    await networkDelay();
    requireRole('administrator');
    const url = new URL(request.url);
    const objectType = url.searchParams.get('objectType');
    const events: AuditEvent[] = getDb()
      .audit.filter((event) => !objectType || event.objectType === objectType)
      .reverse();
    return HttpResponse.json(events);
  }),
];
