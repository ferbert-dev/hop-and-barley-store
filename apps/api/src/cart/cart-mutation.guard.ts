import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { originIsAllowed } from '../config/origin-list';
import { CART_BOOTSTRAP_KEY } from './cart-bootstrap.decorator';
import { CART_BODYLESS_MUTATION_KEY } from './cart-bodyless-mutation.decorator';
import type { CartCookieMode } from './cart-cookie';
import { readCartCookie } from './cart-cookie';
import { CartCsrfService } from './cart-csrf.service';
import type { CartRequest } from './cart-request';
import { CartService } from './cart.service';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const FORBIDDEN = Object.freeze({ status: 'forbidden' as const });

@Injectable()
export class CartMutationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly carts: CartService,
    private readonly csrf: CartCsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CartRequest>();
    if (
      !originIsAllowed(
        this.config.getOrThrow<string>('CART_ORIGIN'),
        request.get('origin'),
      )
    ) {
      throw new ForbiddenException(FORBIDDEN);
    }
    if (
      this.hasUnsupportedMutationBody(
        request,
        this.reflector.getAllAndOverride<boolean>(CART_BODYLESS_MUTATION_KEY, [
          context.getHandler(),
          context.getClass(),
        ]),
      )
    ) {
      throw new UnsupportedMediaTypeException({
        status: 'unsupported-media-type',
      });
    }

    const cookie = readCartCookie(
      request.get('cookie'),
      this.config.getOrThrow<CartCookieMode>('CART_COOKIE_MODE'),
    );
    const bootstrapAllowed = this.reflector.getAllAndOverride<boolean>(
      CART_BOOTSTRAP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (cookie.kind === 'absent' && bootstrapAllowed) {
      request.cartBootstrap = true;
      return true;
    }
    if (cookie.kind !== 'present') {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    const active = await this.carts.authenticate(cookie.rawToken);
    if (!active) throw new UnauthorizedException(UNAUTHORIZED);
    if (!this.csrf.verify(request.get('x-csrf-token'), cookie.rawToken)) {
      throw new ForbiddenException(FORBIDDEN);
    }
    request.activeCart = active;
    return true;
  }

  private hasUnsupportedMutationBody(
    request: CartRequest,
    bodylessAllowed: boolean | undefined,
  ): boolean {
    if (!['PATCH', 'POST'].includes(request.method.toUpperCase())) return false;
    if (!bodylessAllowed) return !request.is('application/json');
    const contentLength = request.get('content-length');
    return (
      request.get('transfer-encoding') !== undefined ||
      (contentLength !== undefined && contentLength !== '0')
    );
  }
}
