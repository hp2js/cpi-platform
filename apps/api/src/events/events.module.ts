import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { DeliveryWorker } from './delivery-worker';

@Module({
  controllers: [EventsController],
  providers: [DeliveryWorker],
  exports: [DeliveryWorker],
})
export class EventsModule {}
