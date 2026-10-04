import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { Delivery, Inbox } from '@cpi/contracts';
import { CurrentUser, Roles, type User } from '../auth/sessions';
import { EventsService } from './events.service';

/** In-app inbox and email delivery log (FR11, AT12). */
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Each user reads only their own inbox; links still pass through access checks. */
  @Get('notifications')
  inbox(@CurrentUser() user: User): Promise<Inbox> {
    return this.events.inbox(user);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: User): Promise<void> {
    return this.events.readAll(user);
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(204)
  read(
    @CurrentUser() user: User,
    @Param('notificationId') id: string,
  ): Promise<void> {
    return this.events.read(user, id);
  }

  @Get('admin/deliveries')
  @Roles('administrator')
  deliveries(@Query('status') status?: string): Promise<Delivery[]> {
    return this.events.deliveries(status);
  }

  @Post('admin/deliveries/:deliveryId/retry')
  @HttpCode(200)
  @Roles('administrator')
  retry(@CurrentUser() user: User, @Param('deliveryId') id: string) {
    return this.events.retry(user, id);
  }

  @Get('admin/email-sink')
  @Roles('administrator')
  emailSink() {
    return this.events.emailSink();
  }
}
