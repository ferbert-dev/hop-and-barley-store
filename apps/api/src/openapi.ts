import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  getSessionCookieName,
  type AuthCookieMode,
} from './auth/session/session-cookie';

export function configureOpenApi(app: INestApplication) {
  const mode = app
    .get(ConfigService)
    .getOrThrow<AuthCookieMode>('AUTH_COOKIE_MODE');
  const cookieName = getSessionCookieName(mode);
  const config = new DocumentBuilder()
    .setTitle('Hop & Barley API')
    .setDescription('API for the Hop & Barley ecommerce platform')
    .setVersion('1.0')
    .addCookieAuth(
      cookieName,
      {
        description: `Host-only ${mode} session cookie.`,
        in: 'cookie',
        name: cookieName,
        type: 'apiKey',
      },
      'sessionCookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  return document;
}
