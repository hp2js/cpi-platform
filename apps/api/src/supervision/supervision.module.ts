import { Module } from '@nestjs/common';
import { SupervisionController } from './supervision.controller';
import { SupervisionRepository } from './supervision.repository';
import { SupervisionService } from './supervision.service';

@Module({
  controllers: [SupervisionController],
  providers: [SupervisionService, SupervisionRepository],
})
export class SupervisionModule {}
