import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Delivery, Inbox } from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { write } from '../database/db';
import { deliveries, emailSink, notifications } from '../database/schema';
import { ApiError, notFound } from '../http/api-error';
import { Infrastructure } from '../infrastructure';
import { Events, attemptDelivery } from './events';

/** In-app inbox, email delivery log and audit trail (FR10, FR11, AT12). */
@Controller()
export class EventsController {
  constructor(
    private readonly infrastructure: Infrastructure,
    private readonly events: Events,
  ) {}

  private get db() {
    return this.infrastructure.database;
  }

  /** Each user reads only their own inbox; links still pass through access checks. */
  @Get('notifications')
  async inbox(@CurrentUser() user: User): Promise<Inbox> {
    const items = await this.db
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
      .where(eq(notifications.recipientId, user.id))
      .orderBy(desc(notifications.seq));
    return { unread: items.filter((item) => !item.readAt).length, items };
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: User) {
    await write(this.db, (tx, businessTime) =>
      tx
        .update(notifications)
        .set({ readAt: businessTime })
        .where(
          and(
            eq(notifications.recipientId, user.id),
            isNull(notifications.readAt),
          ),
        ),
    );
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(204)
  async read(@CurrentUser() user: User, @Param('notificationId') id: string) {
    await write(this.db, async (tx, businessTime) => {
      const [notification] = await tx
        .select()
        .from(notifications)
        .where(
          and(eq(notifications.id, id), eq(notifications.recipientId, user.id)),
        );
      if (!notification) throw notFound();
      if (!notification.readAt)
        await tx
          .update(notifications)
          .set({ readAt: businessTime })
          .where(eq(notifications.id, id));
    });
  }

  @Get('admin/deliveries')
  @Roles('administrator')
  deliveries(@Query('status') status?: string): Promise<Delivery[]> {
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

  @Post('admin/deliveries/:deliveryId/retry')
  @HttpCode(200)
  @Roles('administrator')
  retry(@CurrentUser() user: User, @Param('deliveryId') id: string) {
    return write(this.db, async (tx, businessTime) => {
      const [delivery] = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, id));
      if (!delivery) throw notFound();
      if (delivery.status === 'delivered')
        throw new ApiError(
          409,
          'This message was already delivered.',
          'already_delivered',
        );
      const attempted = await attemptDelivery(tx, businessTime, delivery);
      const delivered = attempted.status === 'delivered';
      if (!delivered)
        await tx
          .update(deliveries)
          .set({ status: 'failed' })
          .where(eq(deliveries.id, id));
      await this.events.audit(
        tx,
        businessTime,
        user,
        'delivery.retry',
        { type: 'delivery', id, version: attempted.attempts },
        delivered ? 'Delivered on manual retry' : 'Manual retry failed',
      );
      return { status: delivered ? 'delivered' : 'failed' };
    });
  }

  @Get('admin/email-sink')
  @Roles('administrator')
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
