import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth-request';
import { setAuthPrivateHeaders } from './auth-private-headers';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

@Injectable()
export class AuthPrivateHeadersMiddleware implements NestMiddleware {
  use(request: AuthRequest, response: Response, next: NextFunction): void {
    setAuthPrivateHeaders(response);
    const supplied = request.get('x-request-id');
    const requestId =
      supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    request.authRequestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
