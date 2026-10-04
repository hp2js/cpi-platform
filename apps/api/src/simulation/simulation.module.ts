import { Module } from '@nestjs/common';
import { SimulationController } from './simulation.controller';
import { RealTimeClock } from './real-time-clock';

@Module({
  controllers: [SimulationController],
  providers: [RealTimeClock],
})
export class SimulationModule {}
