import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormsController } from './forms.controller';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, SettingsController],
})
export class CycleModule {}
