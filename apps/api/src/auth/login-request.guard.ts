import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthRequest } from './auth-request';
import { AuthOriginService } from './auth-origin.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { clientRateIdentity } from './client-rate-identity';

const AUTH_UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });

@Injectable()
export class LoginRequestGuard implements CanActivate {
  private readonly logger = new Logger(LoginRequestGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly origin: AuthOriginService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const requestId = request.authRequestId ?? 'unavailable';
    if (!this.config.get<boolean>('AUTH_SESSIONS_ENABLED')) {
      this.reject('disabled', requestId);
      throw new ServiceUnavailableException(AUTH_UNAVAILABLE);
    }

    try {
      this.origin.assertExact(request.get('origin'));
    } catch (error) {
      this.reject('origin', requestId);
      throw error;
    }
    if (
      request.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    ) {
      this.reject('media_type', requestId);
      throw new UnsupportedMediaTypeException({ status: 'invalid' });
    }

    if (!this.rateLimiter.consumeIp(clientRateIdentity(request))) {
      this.reject('rate_limit_ip', requestId);
      throw new HttpException(AUTH_UNAVAILABLE, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private reject(reason: string, requestId: string): void {
    this.logger.warn(
      `auth.login.rejected reason=${reason} request_id=${requestId}`,
    );
  }
}
