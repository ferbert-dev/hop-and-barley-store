import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartTransportError,
  createBrowserCartTransport,
} from './cart-transport';

const cart = {
  checkoutEligible: true,
  currency: 'USD' as const,
  distinctItemCount: 1,
  items: [
    {
      availability: 'available' as const,
      currentUnitPriceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      lineTotalMinor: 599,
      name: 'Citra Hops',
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      quantity: 1,
    },
  ],
  subtotalMinor: 599,
  totalQuantity: 1,
};

const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
  vary: 'Cookie, Origin',
};

afterEach(() => vi.unstubAllGlobals());

describe('generated-client cart browser transport', () => {
  it('loads the private canonical cart without a client-readable capability', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      response(cart),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCartTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).load(),
    ).resolves.toEqual(cart);

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('http://api:3001/api/v1/cart');
    expect(request.cache).toBe('no-store');
    expect(request.credentials).toBe('include');
    expect(request.headers.get('cookie')).toBeNull();
  });

  it('keeps CSRF ephemeral and forwards it only with an exact-origin update', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCartTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).update('citra-hops', 2),
    ).resolves.toEqual(cart);

    const updateRequest = fetch.mock.calls[1]?.[0] as Request;
    expect(updateRequest.url).toBe(
      'http://api:3001/api/v1/cart/items/citra-hops',
    );
    expect(updateRequest.headers.get('origin')).toBe('http://localhost:3000');
    expect(updateRequest.headers.get('x-csrf-token')).toBe(csrfToken);
    await expect(updateRequest.clone().json()).resolves.toEqual({
      quantity: 2,
    });
  });

  it('allows a first add only after the API confirms that no cart exists', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(undefined, 401))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCartTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).add('citra-hops', 1),
    ).resolves.toEqual(cart);

    const addRequest = fetch.mock.calls[1]?.[0] as Request;
    expect(addRequest.headers.get('origin')).toBe('http://localhost:3000');
    expect(addRequest.headers.get('x-csrf-token')).toBeNull();
  });

  it('fails closed if a private cache directive is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(cart), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    );

    await expect(
      createBrowserCartTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).load(),
    ).rejects.toBeInstanceOf(CartTransportError);
  });

  it('fails closed if the API response is structurally inconsistent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          ...cart,
          items: [{ ...cart.items[0], quantity: -1 }],
        }),
      ),
    );

    await expect(
      createBrowserCartTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).load(),
    ).rejects.toBeInstanceOf(CartTransportError);
  });

  it('uses a fresh CSRF value for remove and clear generated paths', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart))
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);
    const transport = createBrowserCartTransport(
      () => 'http://localhost:3000',
      'http://api:3001',
    );

    await transport.remove('citra-hops');
    await transport.clear();

    expect((fetch.mock.calls[1]?.[0] as Request).url).toBe(
      'http://api:3001/api/v1/cart/items/citra-hops',
    );
    expect((fetch.mock.calls[3]?.[0] as Request).url).toBe(
      'http://api:3001/api/v1/cart/items',
    );
    expect(
      (fetch.mock.calls[3]?.[0] as Request).headers.get('x-csrf-token'),
    ).toBe(csrfToken);
  });
});

function response(body: unknown, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    headers: privateHeaders,
    status,
  });
}
