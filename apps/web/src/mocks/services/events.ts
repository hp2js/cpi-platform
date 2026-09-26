import { getDb, nextId, type MockDb, type MockDelivery } from '../db';
import type { MockUser } from '../seed/cast';
import { assignedInstitutionIds } from './scope';

/**
 * Stand-in for the backend's audit log and durable notification outbox (FR10, FR11). Callers
 * use these inside a `commit` so events are stored together with the change they describe.
 */

export function audit(
  db: MockDb,
  actor: MockUser,
  action: string,
  object: { type: string; id: string; version?: string | number | null },
  summary: string,
) {
  db.audit.push({
    id: nextId('audit'),
    actorName: actor.displayName,
    actorRole: actor.role,
    action,
    objectType: object.type,
    objectId: object.id,
    objectVersion:
      object.version === undefined || object.version === null
        ? null
        : String(object.version),
    summary,
    businessTime: db.businessTime,
    actualTime: new Date().toISOString(),
  });
}

export const MAX_ATTEMPTS = 3;

/** One simulated delivery attempt to the demo email sink. Never contacts a real address. */
export function attemptDelivery(db: MockDb, delivery: MockDelivery) {
  delivery.attempts += 1;
  delivery.lastAttemptAt = db.businessTime;
  if (db.emailFailureMode) {
    delivery.lastError = 'The demo email sink did not accept the message.';
    delivery.status = delivery.attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying';
    return false;
  }
  delivery.status = 'delivered';
  delivery.lastError = null;
  db.emailSink.push({
    id: nextId('mail'),
    to: delivery.recipientEmail,
    subject: delivery.subject,
    body: delivery.body,
    deliveredAt: db.businessTime,
  });
  return true;
}

/** Retries with (simulated) backoff until delivered or the attempt budget is spent. */
function deliverWithRetries(db: MockDb, delivery: MockDelivery) {
  while (delivery.status !== 'delivered' && delivery.attempts < MAX_ATTEMPTS) {
    if (attemptDelivery(db, delivery)) return;
  }
}

/**
 * Notify recipients of an event. The in-app notification is always recorded; email is a
 * minimal summary with a link, never evidence or unreleased scores.
 */
export function notify(
  db: MockDb,
  eventId: string,
  eventType: string,
  recipients: MockUser[],
  message: { title: string; body: string; link: string | null },
) {
  for (const recipient of recipients) {
    const key = `${eventId}:${recipient.id}:email`;
    if (
      !db.notifications.some(
        (notification) =>
          notification.eventId === eventId &&
          notification.recipientId === recipient.id,
      )
    ) {
      db.notifications.push({
        id: nextId('ntf'),
        eventId,
        recipientId: recipient.id,
        eventType,
        title: message.title,
        body: message.body,
        link: message.link,
        createdAt: db.businessTime,
        readAt: null,
      });
    }
    if (db.deliveries.some((delivery) => delivery.key === key)) continue;
    const delivery: MockDelivery = {
      id: nextId('dlv'),
      key,
      eventType,
      recipientId: recipient.id,
      recipientName: recipient.displayName,
      recipientEmail: recipient.email,
      recipientRole: recipient.role,
      subject: message.title,
      body: `${message.body}\n\nSign in to view: ${message.link ?? '/'}`,
      status: 'queued',
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
    };
    db.deliveries.push(delivery);
    deliverWithRetries(db, delivery);
  }
}

export function institutionUsers(institutionId: string) {
  return getDb().users.filter(
    (user) =>
      user.active &&
      user.role === 'institution' &&
      user.institutionId === institutionId,
  );
}

export function assignedOfficers(institutionId: string) {
  return getDb().users.filter(
    (user) =>
      user.active &&
      user.role === 'officer' &&
      assignedInstitutionIds(user.id).includes(institutionId),
  );
}

export function usersWithRole(role: MockUser['role']) {
  return getDb().users.filter((user) => user.active && user.role === role);
}
