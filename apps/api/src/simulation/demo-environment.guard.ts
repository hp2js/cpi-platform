import { Inject, Injectable, type CanActivate } from '@nestjs/common';
import { CONFIG, disposableDatabase, type AppConfig } from '../config';
import { ApiError } from '../http/api-error';

/**
 * Advancing the clock, a new run and the scripted year are demonstration controls: demo mode,
 * on the dedicated disposable demo database only (HP2-42), even for administrators. Outside
 * demo mode business time follows the real clock (`RealTimeClock`).
 */
@Injectable()
export class DemoEnvironmentGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(): boolean {
    if (!this.config.DEMO_MODE)
      throw new ApiError(
        409,
        'This deployment holds real records, so the simulation cannot reset or script the year.',
        'demo_only',
      );
    if (!disposableDatabase(this.config))
      throw new ApiError(
        409,
        'The simulation can only reset or script the year on the dedicated demo database (its name ends in _demo).',
        'not_demo_database',
      );
    return true;
  }
}
