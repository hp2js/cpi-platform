import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantRepository } from './assistant.repository';
import { AssistantService } from './assistant.service';

@Module({
  controllers: [AssistantController],
  providers: [AssistantService, AssistantRepository],
  exports: [AssistantService],
})
export class AssistantModule {}
