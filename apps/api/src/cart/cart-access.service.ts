import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  readSessionCookie,
  type AuthCookieMode,
} from '../auth/session/session-cookie';
import { SessionService } from '../auth/session/session.service';
import { readCartCookie, type CartCookieMode } from './cart-cookie';
import type { ActiveCartAccess } from './cart-request';
import { CartService } from './cart.service';

export type CartAccessResolution =
  | Readonly<{ kind: 'account_absent'; rawToken: string; userId: string }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ access: ActiveCartAccess; kind: 'present' }>;

@Injectable()
export class CartAccessService {
  constructor(
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly carts: CartService,
  ) {}

  async resolve(
    cookieHeader: string | undefined,
  ): Promise<CartAccessResolution> {
    if (this.config.get<boolean>('AUTH_SESSIONS_ENABLED')) {
      const sessionToken = readSessionCookie(
        cookieHeader,
        this.config.getOrThrow<AuthCookieMode>('AUTH_COOKIE_MODE'),
      );
      if (sessionToken) {
        const session = await this.sessions.authenticate(sessionToken);
        if (session) {
          const account = await this.carts.authenticateAccount(
            session.userId,
            sessionToken,
          );
          if (account) return { access: account, kind: 'present' };
          return {
            kind: 'account_absent',
            rawToken: sessionToken,
            userId: session.userId,
          };
        }
      }
    }

    const cookie = readCartCookie(
      cookieHeader,
      this.config.getOrThrow<CartCookieMode>('CART_COOKIE_MODE'),
    );
    if (cookie.kind !== 'present') return cookie;
    const guest = await this.carts.authenticate(cookie.rawToken);
    return guest ? { access: guest, kind: 'present' } : { kind: 'invalid' };
  }

  createAccountCart(
    missing: Extract<CartAccessResolution, { kind: 'account_absent' }>,
  ) {
    return this.carts.createAccountCart(missing.userId, missing.rawToken);
  }
}
