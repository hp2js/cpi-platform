import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { CONFIG, loadConfig } from './config';
import { HealthController } from './health.controller';
import { Infrastructure } from './infrastructure';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    Infrastructure,
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const config = app.get<ReturnType<typeof loadConfig>>(CONFIG);
  await app.listen(config.API_PORT, '0.0.0.0');
}
void bootstrap();
