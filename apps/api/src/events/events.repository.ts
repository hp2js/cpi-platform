import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Delivery } from '@cpi/contracts';
import { DB, type Database, type Db } from '../database/db';
import { deliveries, emailSink, notifications } from '../database/schema';

@Injectable()
export class EventsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  inbox(recipientId: string) {
    return this.db
      .select({
        id: notifications.id,
        eventType: notifications.eventType,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(eq(notifications.recipientId, recipientId))
      .orderBy(desc(notifications.seq));
  }

  async markAllRead(recipientId: string, readAt: string, db: Db = this.db) {
    await db
      .update(notifications)
      .set({ readAt })
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          isNull(notifications.readAt),
        ),
      );
  }

  async notification(id: string, recipientId: string, db: Db = this.db) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientId, recipientId),
        ),
      );
    return notification;
  }

  async markRead(id: string, readAt: string, db: Db = this.db) {
    await db
      .update(notifications)
      .set({ readAt })
      .where(eq(notifications.id, id));
  }

  deliveries(status?: string): Promise<Delivery[]> {
    return this.db
      .select({
        id: deliveries.id,
        eventType: deliveries.eventType,
        recipientName: deliveries.recipientName,
        recipientEmail: deliveries.recipientEmail,
        subject: deliveries.subject,
        status: deliveries.status,
        attempts: deliveries.attempts,
        lastAttemptAt: deliveries.lastAttemptAt,
        lastError: deliveries.lastError,
      })
      .from(deliveries)
      .where(
        status
          ? eq(deliveries.status, status as Delivery['status'])
          : undefined,
      )
      .orderBy(desc(deliveries.seq));
  }

  async delivery(id: string, db: Db = this.db) {
    const [delivery] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, id));
    return delivery;
  }

  emailSink() {
    return this.db
      .select({
        id: emailSink.id,
        to: emailSink.to,
        subject: emailSink.subject,
        body: emailSink.body,
        deliveredAt: emailSink.deliveredAt,
      })
      .from(emailSink)
      .orderBy(desc(emailSink.seq));
  }
}
