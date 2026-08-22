import type { Response } from 'express';

export const CART_CACHE_CONTROL = 'private, no-store';
export const CART_VARY = 'Cookie, Origin';

export function setCartPrivateHeaders(response: Response): void {
  response.setHeader('Cache-Control', CART_CACHE_CONTROL);
  response.setHeader('Vary', CART_VARY);
}
