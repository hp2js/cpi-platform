import { Module } from '@nestjs/common';
import { AnnualController } from './annual.controller';
import { AnnualRepository } from './annual.repository';
import { AnnualService } from './annual.service';

@Module({
  controllers: [AnnualController],
  providers: [AnnualService, AnnualRepository],
})
export class AnnualModule {}
