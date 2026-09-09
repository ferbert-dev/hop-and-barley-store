import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  getSessionCookieName,
  type AuthCookieMode,
} from './auth/session/session-cookie';
import { getCartCookieName, type CartCookieMode } from './cart/cart-cookie';
import { getCheckoutCapabilityCookieName } from './checkout/checkout-capability-cookie';

export function configureOpenApi(app: INestApplication) {
  const mode = app
    .get(ConfigService)
    .getOrThrow<AuthCookieMode>('AUTH_COOKIE_MODE');
  const cookieName = getSessionCookieName(mode);
  const cartMode = app
    .get(ConfigService)
    .getOrThrow<CartCookieMode>('CART_COOKIE_MODE');
  const cartCookieName = getCartCookieName(cartMode);
  const checkoutCookieName = getCheckoutCapabilityCookieName(cartMode);
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
    .addCookieAuth(
      cartCookieName,
      {
        description: `Host-only ${cartMode} opaque guest-cart capability cookie. The raw capability and its digest never appear in response bodies.`,
        in: 'cookie',
        name: cartCookieName,
        type: 'apiKey',
      },
      'cartCookie',
    )
    .addCookieAuth(
      checkoutCookieName,
      {
        description:
          'Host-only cookie for the private guest pre-payment draft. Only its SHA-256 digest is persisted; the raw capability never appears in a URL or JSON response.',
        in: 'cookie',
        name: checkoutCookieName,
        type: 'apiKey',
      },
      'guestCheckoutCookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api/docs', app, document);

  return document;
}
