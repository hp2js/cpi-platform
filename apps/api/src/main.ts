import 'reflect-metadata';
import { ConsoleLogger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { CONFIG, loadConfig } from './config';
import { HealthController } from './health.controller';
import { Infrastructure } from './infrastructure';
import { bodyParsers } from './http/body-parsers';
import { requestContext } from './http/diagnostics';
import { ApiExceptionFilter } from './http/errors.filter';

@Module({
  controllers: [HealthController],
  providers: [
    { provide: CONFIG, useFactory: () => loadConfig(process.env) },
    Infrastructure,
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
    bodyParser: false,
  });
  app.use(requestContext);
  app.use(helmet());
  app.use(...bodyParsers);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const config = app.get<ReturnType<typeof loadConfig>>(CONFIG);
  await app.listen(config.API_PORT, '0.0.0.0');
}
void bootstrap();
