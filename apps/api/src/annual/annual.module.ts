import { Module } from '@nestjs/common';
import { AnnualController } from './annual.controller';

@Module({
  controllers: [AnnualController],
})
export class AnnualModule {}
