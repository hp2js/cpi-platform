import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { DevController } from './dev.controller';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [DevController],
})
export class DevModule {}
