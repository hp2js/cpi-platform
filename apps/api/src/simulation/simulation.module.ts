import { Module } from '@nestjs/common';
import { RealTimeClock } from './real-time-clock';
import { SimulationController } from './simulation.controller';
import { SimulationRepository } from './simulation.repository';
import { SimulationService } from './simulation.service';

@Module({
  controllers: [SimulationController],
  providers: [SimulationService, SimulationRepository, RealTimeClock],
})
export class SimulationModule {}
