import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest } from '../auth/auth-request';

export const ADMIN_ONLY_KEY = 'hop-and-barley.auth.admin-only';

const FORBIDDEN = Object.freeze({ status: 'forbidden' as const });
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

@Injectable()
export class AdminAuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(
      ADMIN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isAdminOnly !== true) {
      throw new ForbiddenException(FORBIDDEN);
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const principal = request.activeSession;
    if (!principal) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    if (principal.status !== 'ACTIVE' || principal.role !== 'ADMIN') {
      throw new ForbiddenException(FORBIDDEN);
    }

    return true;
  }
}
