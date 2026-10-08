import { Module } from '@nestjs/common';
import { CycleModule } from '../cycle/cycle.module';
import { AnnualController } from './annual.controller';
import { AnnualRepository } from './annual.repository';
import { AnnualService } from './annual.service';

@Module({
  imports: [CycleModule],
  controllers: [AnnualController],
  providers: [AnnualService, AnnualRepository],
})
export class AnnualModule {}
