import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormsController } from './forms.controller';
import { FormsRepository } from './forms.repository';
import { FormsService } from './forms.service';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, SettingsController],
  providers: [
    FormsService,
    FormsRepository,
    SettingsService,
    SettingsRepository,
    PeopleService,
    PeopleRepository,
  ],
  exports: [SettingsRepository],
})
export class CycleModule {}
