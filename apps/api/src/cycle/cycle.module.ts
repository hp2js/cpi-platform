import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormsController } from './forms.controller';
import { FormsRepository } from './forms.repository';
import { FormsService } from './forms.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, SettingsController],
  providers: [FormsService, FormsRepository],
})
export class CycleModule {}
