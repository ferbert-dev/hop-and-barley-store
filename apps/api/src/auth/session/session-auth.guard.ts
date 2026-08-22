import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AuthOriginService } from '../auth-origin.service';
import { setAuthPrivateHeaders } from '../auth-private-headers';
import type { AuthRequest } from '../auth-request';
import { IS_PUBLIC_KEY } from '../public.decorator';
import { CsrfService } from './csrf.service';
import { type AuthCookieMode, readSessionCookie } from './session-cookie';
import { SessionService } from './session.service';

const AUTH_UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly sessions: SessionService,
    private readonly origin: AuthOriginService,
    private readonly csrf: CsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthRequest>();
    const response = http.getResponse<Response>();
    setAuthPrivateHeaders(response);
    if (!this.config.get<boolean>('AUTH_SESSIONS_ENABLED')) {
      this.reject('disabled', request);
      throw new ServiceUnavailableException(AUTH_UNAVAILABLE);
    }

    const mode = this.config.get<AuthCookieMode>('AUTH_COOKIE_MODE');
    const rawToken = mode
      ? readSessionCookie(request.get('cookie'), mode)
      : null;
    if (!rawToken) {
      this.reject('cookie', request);
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    const activeSession = await this.sessions.authenticate(rawToken);
    if (!activeSession) {
      this.reject('session', request);
      throw new UnauthorizedException(UNAUTHORIZED);
    }

    if (isUnsafeMethod(request.method)) {
      try {
        this.origin.assertExact(request.get('origin'));
      } catch (error) {
        this.reject('origin', request);
        throw error;
      }
      if (!this.csrf.verify(request.get('x-csrf-token'), rawToken)) {
        this.reject('csrf', request);
        throw new ForbiddenException({ status: 'forbidden' });
      }
    }

    request.activeSession = activeSession;
    return true;
  }

  private reject(reason: string, request: AuthRequest): void {
    this.logger.warn(
      `auth.session.rejected reason=${reason} request_id=${request.authRequestId ?? 'unavailable'} method=${request.method}`,
    );
  }
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
