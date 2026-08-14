import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Hop & Barley API')
    .setDescription('API for the Hop & Barley ecommerce platform')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  return document;
}
