import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FormsController } from './forms.controller';
import { FormsRepository } from './forms.repository';
import { FormsService } from './forms.service';
import { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';
import { ReportIdentityController } from './report-identity.controller';
import { ReportIdentityRepository } from './report-identity.repository';
import { ReportIdentityService } from './report-identity.service';
import { SettingsController } from './settings.controller';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule],
  controllers: [FormsController, SettingsController, ReportIdentityController],
  providers: [
    FormsService,
    FormsRepository,
    SettingsService,
    SettingsRepository,
    PeopleService,
    PeopleRepository,
    ReportIdentityService,
    ReportIdentityRepository,
  ],
  exports: [SettingsRepository, ReportIdentityService],
})
export class CycleModule {}
