import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureAppRouting } from './app-routing';
import { configureAppValidation } from './app-validation';
import { configureOpenApi } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureAppRouting(app);
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()),
  });
  app.use(helmet());
  configureAppValidation(app);
  app.enableShutdownHooks();
  configureOpenApi(app);

  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}

void bootstrap();
