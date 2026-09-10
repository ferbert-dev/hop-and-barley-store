import type { Response } from 'express';

export function setCheckoutPrivateHeaders(response: Response): void {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Vary', 'Cookie, Origin');
}
