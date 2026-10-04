import { Module } from '@nestjs/common';
import { CycleModule } from '../cycle/cycle.module';
import { RealTimeClock } from './real-time-clock';
import { SimulationController } from './simulation.controller';
import { SimulationRepository } from './simulation.repository';
import { SimulationService } from './simulation.service';

@Module({
  imports: [CycleModule],
  controllers: [SimulationController],
  providers: [SimulationService, SimulationRepository, RealTimeClock],
})
export class SimulationModule {}
