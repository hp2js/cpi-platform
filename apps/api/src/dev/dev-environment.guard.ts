import { Inject, Injectable, type CanActivate } from '@nestjs/common';
import { CONFIG, disposableDatabase, type AppConfig } from '../config';
import { notFound } from '../http/api-error';

/** Development controls answer 404 outside development demo deployments on the demo database. */
@Injectable()
export class DevEnvironmentGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(): boolean {
    if (
      this.config.NODE_ENV === 'production' ||
      !this.config.DEMO_MODE ||
      !disposableDatabase(this.config)
    )
      throw notFound();
    return true;
  }
}
