import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartTransportError,
  createBrowserCartTransport,
} from './cart-transport';

const cart = {
  adjustmentMessage: null,
  checkoutEligible: true,
  currency: 'USD' as const,
  distinctItemCount: 1,
  items: [
    {
      availability: 'available' as const,
      priceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      kitYieldVolumeMl: null,
      lineTotalMinor: 599,
      maximumOrderAmount: 100_000_000,
      minimumOrderAmount: 100_000,
      name: 'Citra Hops',
      orderStepAmount: 5_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      amount: 100_000,
      reservationExpiresAt: '2026-08-25T10:15:00.000Z',
      reservationStatus: 'active' as const,
      saleKind: 'WEIGHT' as const,
      stockAmount: 100_000_000,
      amountUnit: 'MILLIGRAM' as const,
    },
  ],
  serverNow: '2026-08-25T10:00:00.000Z',
  subtotalMinor: 599,
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

  it('matches the API loopback hostname to the browser origin', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      response(cart),
    );
    vi.stubGlobal('fetch', fetch);

    await createBrowserCartTransport(
      () => 'http://127.0.0.1:3000',
      'http://localhost:3001',
      'localhost,127.0.0.1',
    ).load();

    expect((fetch.mock.calls[0]?.[0] as Request).url).toBe(
      'http://127.0.0.1:3001/api/v1/cart',
    );
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
      amount: 2,
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

  it('rechecks the cart with a fresh CSRF token and private response handling', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);

    const transport = createBrowserCartTransport(
      () => 'http://localhost:3000',
      'http://api:3001',
    );
    expect(transport.recheck).toBeTypeOf('function');

    await expect(transport.recheck()).resolves.toEqual(cart);

    const recheckRequest = fetch.mock.calls[1]?.[0] as Request;
    expect(recheckRequest.method).toBe('POST');
    expect(recheckRequest.url).toBe('http://api:3001/api/v1/cart/recheck');
    expect(recheckRequest.cache).toBe('no-store');
    expect(recheckRequest.credentials).toBe('include');
    expect(recheckRequest.headers.get('origin')).toBe('http://localhost:3000');
    expect(recheckRequest.headers.get('x-csrf-token')).toBe(csrfToken);
    expect(recheckRequest.headers.get('content-type')).toBeNull();
    await expect(recheckRequest.clone().text()).resolves.toBe('');
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
          items: [{ ...cart.items[0], amount: -1 }],
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

  it.each([
    ['an invalid server timestamp', { ...cart, serverNow: 'not-a-date' }],
    ['a non-string adjustment message', { ...cart, adjustmentMessage: 1 }],
    [
      'an unreserved item with an expiry',
      {
        ...cart,
        items: [
          {
            ...cart.items[0],
            reservationExpiresAt: '2026-08-25T10:15:00.000Z',
            reservationStatus: 'unreserved',
          },
        ],
      },
    ],
    [
      'an active item without an expiry',
      {
        ...cart,
        items: [
          {
            ...cart.items[0],
            reservationExpiresAt: null,
            reservationStatus: 'active',
          },
        ],
      },
    ],
    [
      'an expired item with an invalid expiry',
      {
        ...cart,
        items: [
          {
            ...cart.items[0],
            reservationExpiresAt: '2026-02-30T10:15:00.000Z',
            reservationStatus: 'expired',
          },
        ],
      },
    ],
  ])('fails closed for %s', async (_case, malformedCart) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(malformedCart)),
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
