import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CartCookieMode } from './cart-cookie';
import { readCartCookie } from './cart-cookie';
import type { CartRequest } from './cart-request';
import { CartService } from './cart.service';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

@Injectable()
export class CartCapabilityGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly carts: CartService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CartRequest>();
    const cookie = readCartCookie(
      request.get('cookie'),
      this.config.getOrThrow<CartCookieMode>('CART_COOKIE_MODE'),
    );
    if (cookie.kind !== 'present') {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    const active = await this.carts.authenticate(cookie.rawToken);
    if (!active) throw new UnauthorizedException(UNAUTHORIZED);
    request.activeCart = active;
    return true;
  }
}
