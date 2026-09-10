import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { setCheckoutPrivateHeaders } from './checkout-private-headers';

@Injectable()
export class CheckoutPrivateHeadersMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    setCheckoutPrivateHeaders(response);
    next();
  }
}
