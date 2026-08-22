import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  REGISTRATION_CACHE_CONTROL,
  REGISTRATION_UNAVAILABLE,
  REGISTRATION_VARY,
} from './auth.constants';
import { RegistrationRateLimiter } from './registration-rate-limiter';
import { clientRateIdentity } from './client-rate-identity';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export type RegistrationRequest = Request & { registrationRequestId: string };

@Injectable()
export class RegistrationRequestGuard implements CanActivate {
  private readonly logger = new Logger(RegistrationRequestGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly rateLimiter: RegistrationRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RegistrationRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const suppliedRequestId = request.get('x-request-id');
    const requestId =
      suppliedRequestId && SAFE_REQUEST_ID.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    request.registrationRequestId = requestId;
    response.setHeader('Cache-Control', REGISTRATION_CACHE_CONTROL);
    response.setHeader('Vary', REGISTRATION_VARY);
    response.setHeader('X-Request-Id', requestId);

    if (!this.config.get<boolean>('REGISTRATION_ENABLED')) {
      this.reject('disabled', requestId);
      throw new ServiceUnavailableException(REGISTRATION_UNAVAILABLE);
    }
    if (
      request.get('origin') !== this.config.get<string>('REGISTRATION_ORIGIN')
    ) {
      this.reject('origin', requestId);
      throw new ForbiddenException({ status: 'forbidden' });
    }
    if (
      request.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    ) {
      this.reject('media_type', requestId);
      throw new UnsupportedMediaTypeException({ status: 'invalid' });
    }

    const clientAddress = clientRateIdentity(request);
    if (!this.rateLimiter.consume(clientAddress)) {
      this.reject('rate_limit', requestId);
      throw new HttpException(
        REGISTRATION_UNAVAILABLE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private reject(reason: string, requestId: string): void {
    this.logger.warn(
      `auth.registration.rejected reason=${reason} request_id=${requestId}`,
    );
  }
}
