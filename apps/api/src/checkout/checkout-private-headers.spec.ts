import type { Response } from 'express';
import { setCheckoutPrivateHeaders } from './checkout-private-headers';

describe('checkout private response headers', () => {
  it('prevents shared or browser caching and varies on both capabilities', () => {
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    setCheckoutPrivateHeaders(response);
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(setHeader).toHaveBeenCalledWith('Vary', 'Cookie, Origin');
  });
});
