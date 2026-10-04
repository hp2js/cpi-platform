import { Module } from '@nestjs/common';
import { SupervisionController } from './supervision.controller';

@Module({
  controllers: [SupervisionController],
})
export class SupervisionModule {}
