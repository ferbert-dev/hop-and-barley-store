import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CartRequest } from './cart-request';
import { CartAccessService } from './cart-access.service';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

@Injectable()
export class CartCapabilityGuard implements CanActivate {
  constructor(private readonly access: CartAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CartRequest>();
    const resolved = await this.access.resolve(request.get('cookie'));
    if (resolved.kind === 'account_absent') {
      request.activeCart = await this.access.createAccountCart(resolved);
      return true;
    }
    if (resolved.kind !== 'present') {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    request.activeCart = resolved.access;
    return true;
  }
}
