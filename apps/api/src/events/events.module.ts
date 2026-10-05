import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { DeliveryWorker } from './delivery-worker';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, DeliveryWorker],
  exports: [DeliveryWorker],
})
export class EventsModule {}
