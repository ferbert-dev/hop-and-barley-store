import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_GLOBAL_PREFIX } from '../app-routing';
import type { AuthRequest } from '../auth/auth-request';

export const ADMIN_ONLY_KEY = 'hop-and-barley.auth.admin-only';
const ADMIN_API_PREFIX = `/${API_GLOBAL_PREFIX}/admin`;

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
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!isAdminApiPath(request.path) && isAdminOnly !== true) {
      return true;
    }

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

function isAdminApiPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();
  return (
    normalizedPath === ADMIN_API_PREFIX ||
    normalizedPath.startsWith(`${ADMIN_API_PREFIX}/`)
  );
}
