import type { Response } from 'express';

export const AUTH_CACHE_CONTROL = 'private, no-store';
export const AUTH_VARY = 'Cookie, Origin';

export function setAuthPrivateHeaders(response: Response): void {
  response.setHeader('Cache-Control', AUTH_CACHE_CONTROL);
  response.setHeader('Vary', AUTH_VARY);
}
