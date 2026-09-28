import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { Role } from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { CONFIG, type AppConfig } from '../config';
import { nextId, type Db, type Tx } from '../database/db';
import {
  assignments,
  auditEvents,
  deliveries,
  emailSink,
  notifications,
  systemState,
  users,
} from '../database/schema';
import { toNairobi } from '../database/schema';

export const MAX_ATTEMPTS = 3;
type Delivery = typeof deliveries.$inferSelect;

/**
 * Audit log and notification outbox (FR10, FR11). Call inside the `write()` transaction of the
 * change they describe, so events are stored with it or not at all.
 */
@Injectable()
export class Events {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  async audit(
    tx: Tx,
    businessTime: string,
    actor: User,
    action: string,
    object: { type: string; id: string; version?: string | number | null },
    summary: string,
  ) {
    await tx.insert(auditEvents).values({
      id: await nextId(tx, 'audit'),
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
      businessTime,
      actualTime: toNairobi(new Date()),
    });
  }

  /**
   * Notify recipients once per event: the in-app notification always, and a minimal email
   * summary with a link (never evidence or unreleased scores) to the demo sink.
   */
  async notify(
    tx: Tx,
    businessTime: string,
    eventId: string,
    eventType: string,
    recipients: User[],
    message: {
      title: string;
      body: string;
      /** A portal path; a function when the destination depends on the recipient. */
      link: string | null | ((recipient: User) => string | null);
    },
  ) {
    for (const recipient of recipients) {
      const link =
        typeof message.link === 'function'
          ? message.link(recipient)
          : message.link;
      await tx
        .insert(notifications)
        .values({
          id: await nextId(tx, 'ntf'),
          eventId,
          recipientId: recipient.id,
          eventType,
          title: message.title,
          body: message.body,
          link,
          createdAt: businessTime,
        })
        .onConflictDoNothing();
      const [delivery] = await tx
        .insert(deliveries)
        .values({
          id: await nextId(tx, 'dlv'),
          key: `${eventId}:${recipient.id}:email`,
          eventType,
          recipientId: recipient.id,
          recipientName: recipient.displayName,
          recipientEmail: recipient.email,
          recipientRole: recipient.role,
          subject: message.title,
          body: link
            ? `${message.body}\n\nOpen in the portal: ${new URL(link, this.config.PORTAL_URL).href}`
            : message.body,
          status: 'queued',
        })
        .onConflictDoNothing()
        .returning();
      if (!delivery) continue;
      let current = delivery;
      while (current.status !== 'delivered' && current.attempts < MAX_ATTEMPTS)
        current = await attemptDelivery(tx, businessTime, current);
    }
  }
}

/** One simulated attempt to the demo email sink. Never contacts a real address. */
export async function attemptDelivery(
  tx: Tx,
  businessTime: string,
  delivery: Delivery,
): Promise<Delivery> {
  const [state] = await tx
    .select({ failing: systemState.emailFailureMode })
    .from(systemState);
  const attempts = delivery.attempts + 1;
  if (state?.failing) {
    const [updated] = await tx
      .update(deliveries)
      .set({
        attempts,
        lastAttemptAt: businessTime,
        lastError: 'The demo email sink did not accept the message.',
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying',
      })
      .where(eq(deliveries.id, delivery.id))
      .returning();
    return updated!;
  }
  await tx.insert(emailSink).values({
    id: await nextId(tx, 'mail'),
    to: delivery.recipientEmail,
    subject: delivery.subject,
    body: delivery.body,
    deliveredAt: businessTime,
  });
  const [updated] = await tx
    .update(deliveries)
    .set({
      attempts,
      lastAttemptAt: businessTime,
      lastError: null,
      status: 'delivered',
    })
    .where(eq(deliveries.id, delivery.id))
    .returning();
  return updated!;
}

/* Recipients */

export function usersWithRole(db: Db, role: Role) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.active, true), eq(users.role, role)))
    .orderBy(users.id);
}

export function institutionUsers(db: Db, institutionId: string) {
  return db
    .select()
    .from(users)
    .where(
      and(
        eq(users.active, true),
        eq(users.role, 'institution'),
        eq(users.institutionId, institutionId),
      ),
    )
    .orderBy(users.id);
}

export async function assignedOfficers(db: Db, institutionId: string) {
  const rows = await db
    .select({ user: users })
    .from(users)
    .innerJoin(assignments, eq(assignments.officerId, users.id))
    .where(
      and(
        eq(users.active, true),
        eq(users.role, 'officer'),
        eq(assignments.institutionId, institutionId),
        isNull(assignments.validTo),
      ),
    )
    .orderBy(users.id);
  return rows.map((row) => row.user);
}
