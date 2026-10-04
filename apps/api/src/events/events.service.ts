import { Inject, Injectable } from '@nestjs/common';
import type { Delivery, Inbox } from '@cpi/contracts';
import type { User } from '../auth/sessions';
import { DB, write, type Database } from '../database/db';
import { ApiError, notFound } from '../http/api-error';
import { Events, attemptDelivery } from './events';
import { EventsRepository } from './events.repository';

/** In-app inbox and the email delivery log (FR11, AT12). */
@Injectable()
export class EventsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly repository: EventsRepository,
    private readonly events: Events,
  ) {}

  async inbox(user: User): Promise<Inbox> {
    const items = await this.repository.inbox(user.id);
    return { unread: items.filter((item) => !item.readAt).length, items };
  }

  async readAll(user: User): Promise<void> {
    await write(this.db, (tx, businessTime) =>
      this.repository.markAllRead(user.id, businessTime, tx),
    );
  }

  async read(user: User, id: string): Promise<void> {
    await write(this.db, async (tx, businessTime) => {
      const notification = await this.repository.notification(id, user.id, tx);
      if (!notification) throw notFound();
      if (!notification.readAt)
        await this.repository.markRead(id, businessTime, tx);
    });
  }

  deliveries(status?: string): Promise<Delivery[]> {
    return this.repository.deliveries(status);
  }

  retry(user: User, id: string): Promise<{ status: 'delivered' | 'failed' }> {
    return write(this.db, async (tx, businessTime) => {
      const delivery = await this.repository.delivery(id, tx);
      if (!delivery) throw notFound();
      if (delivery.status === 'delivered')
        throw new ApiError(
          409,
          'This message was already delivered.',
          'already_delivered',
        );
      // A manual retry is one attempt; if it fails, the delivery returns to the failure queue.
      const attempted = await attemptDelivery(tx, businessTime, delivery, null);
      const delivered = attempted.status === 'delivered';
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

  emailSink() {
    return this.repository.emailSink();
  }
}
