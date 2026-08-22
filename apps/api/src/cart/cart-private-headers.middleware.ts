import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { setCartPrivateHeaders } from './cart-private-headers';
import type { CartRequest } from './cart-request';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

@Injectable()
export class CartPrivateHeadersMiddleware implements NestMiddleware {
  use(request: CartRequest, response: Response, next: NextFunction): void {
    setCartPrivateHeaders(response);
    const supplied = request.get('x-request-id');
    const requestId =
      supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    request.cartRequestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    next();
  }
}
