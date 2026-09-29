import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/sessions';
import { Infrastructure } from './infrastructure';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly infrastructure: Infrastructure) {}
  @Get('live')
  live() {
    return { status: 'ok' as const };
  }
  @Get('ready')
  async ready() {
    const result = await this.infrastructure.readiness();
    if (result.status !== 'ok') throw new ServiceUnavailableException(result);
    return result;
  }
}
