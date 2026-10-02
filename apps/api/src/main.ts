import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { CONFIG, type loadConfig } from './config';
import { seedOptions } from './database/fixtures';
import { prepareDatabase } from './database/setup';
import { Mailer } from './email/mailer';
import { Infrastructure } from './infrastructure';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
    bodyParser: false,
  });
  configureApp(app);
  app.enableShutdownHooks();
  const config = app.get<ReturnType<typeof loadConfig>>(CONFIG);
  if (config.DB_AUTO_SETUP)
    await prepareDatabase(
      app.get(Infrastructure).database,
      seedOptions(config, app.get(Mailer)),
    );
  await app.listen(config.API_PORT, '0.0.0.0');
}
void bootstrap();
