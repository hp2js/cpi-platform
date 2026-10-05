import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { DevController } from './dev.controller';
import { DevRepository } from './dev.repository';
import { DevService } from './dev.service';

@Module({
  imports: [AuthModule, EventsModule],
  controllers: [DevController],
  providers: [DevService, DevRepository],
})
export class DevModule {}
