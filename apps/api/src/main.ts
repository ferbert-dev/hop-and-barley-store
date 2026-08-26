import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_CORS_ALLOWED_HEADERS } from './app-cors';
import { configureAppRouting } from './app-routing';
import { configureAppValidation } from './app-validation';
import { configureOpenApi } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  app.set('trust proxy', false);
  configureAppRouting(app);
  app.enableCors({
    allowedHeaders: [...API_CORS_ALLOWED_HEADERS],
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });
  app.use(helmet());
  configureAppValidation(app);
  app.enableShutdownHooks();
  configureOpenApi(app);

  await app.listen(config.get<number>('PORT') ?? 3001, '0.0.0.0');
}

void bootstrap();
