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
import { CsrfService } from '../auth/session/csrf.service';
import { CartAccessService } from './cart-access.service';
import { CartCsrfService } from './cart-csrf.service';
import type { CartRequest } from './cart-request';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const FORBIDDEN = Object.freeze({ status: 'forbidden' as const });

@Injectable()
export class CartMutationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly access: CartAccessService,
    private readonly csrf: CartCsrfService,
    private readonly sessionCsrf: CsrfService,
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

    const resolved = await this.access.resolve(request.get('cookie'));
    const bootstrapAllowed = this.reflector.getAllAndOverride<boolean>(
      CART_BOOTSTRAP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (resolved.kind === 'account_absent') {
      if (
        !this.sessionCsrf.verify(request.get('x-csrf-token'), resolved.rawToken)
      ) {
        throw new ForbiddenException(FORBIDDEN);
      }
      request.activeCart = await this.access.createAccountCart(resolved);
      return true;
    }
    if (resolved.kind === 'absent' && bootstrapAllowed) {
      request.cartBootstrap = true;
      return true;
    }
    if (resolved.kind !== 'present') {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    const csrf =
      resolved.access.kind === 'account' ? this.sessionCsrf : this.csrf;
    if (!csrf.verify(request.get('x-csrf-token'), resolved.access.rawToken)) {
      throw new ForbiddenException(FORBIDDEN);
    }
    request.activeCart = resolved.access;
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
