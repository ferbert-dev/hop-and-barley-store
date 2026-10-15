import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartTransportError,
  createBrowserCartTransport,
} from './cart-transport';
import { PAYMENT_HANDOFF_KEY } from '../checkout/checkout-payment-handoff';

const cart = {
  currency: 'EUR' as const,
  distinctItemCount: 1,
  items: [
    {
      priceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      kitYieldVolumeMl: null,
      lineTotalMinor: 599,
      maximumOrderAmount: 100_000_000,
      minimumOrderAmount: 100_000,
      name: 'Citra Hops',
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      amount: 100_000,
      saleKind: 'WEIGHT' as const,
      stockAmount: 100_000_000,
      amountUnit: 'MILLIGRAM' as const,
    },
  ],
  subtotalMinor: 599,
};

const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
  vary: 'Cookie, Origin',
};

const csrfToken = `v1.${'A'.repeat(43)}`;
const draftId = '30000000-0000-4000-8000-000000000001';
const attemptId = '40000000-0000-4000-8000-000000000001';
const idempotencyKey = '50000000-0000-4000-8000-000000000001';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

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

  it('marks an exact legacy payment success before adding with the old cart capability', async () => {
    savePaymentHandoff();
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(
        response({ attemptId, status: 'succeeded' as const }),
      )
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);

    await expect(cartTransport().add('citra-hops', 100_000)).resolves.toEqual(
      cart,
    );

    expect(requestUrls(fetch)).toEqual([
      'http://api:3001/api/v1/payments/stripe/status',
      'http://api:3001/api/v1/cart/csrf',
      'http://api:3001/api/v1/cart/items',
    ]);
    expect(readSavedHandoff()).toEqual({
      attemptId,
      draftId,
      key: idempotencyKey,
      settled: 'succeeded',
    });
  });

  it.each([
    ['ready payment', { attemptId, status: 'ready_for_redirect' }, 200],
    ['processing payment', { attemptId, status: 'processing' }, 200],
    ['failed payment', { attemptId, status: 'failed' }, 200],
    ['cancelled payment', { attemptId, status: 'cancelled' }, 200],
    ['unknown payment response', { attemptId, status: 'unknown' }, 200],
    ['absent payment', undefined, 404],
    ['unauthorized payment', undefined, 401],
    ['unavailable payment', undefined, 503],
  ])(
    'aborts add for an unmarked %s without changing its handoff',
    async (_label, statusBody, statusCode) => {
      savePaymentHandoff();
      const saved = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
      const fetch = vi
        .fn<(request: Request) => Promise<Response>>()
        .mockResolvedValue(response(statusBody, statusCode));
      vi.stubGlobal('fetch', fetch);

      await expect(
        cartTransport().add('citra-hops', 100_000),
      ).rejects.toBeInstanceOf(CartTransportError);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect((fetch.mock.calls[0]?.[0] as Request).url).toBe(
        'http://api:3001/api/v1/payments/stripe/status',
      );
      expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBe(saved);
    },
  );

  it('aborts add when payment status loses private response headers', async () => {
    savePaymentHandoff();
    const saved = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
    const fetch = vi.fn(async () =>
      Response.json({ attemptId, status: 'succeeded' }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      cartTransport().add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBe(saved);
  });

  it('aborts add on a payment status network failure without retrying the mutation', async () => {
    savePaymentHandoff();
    const saved = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
    const fetch = vi.fn(async () => {
      throw new TypeError('network unavailable');
    });
    vi.stubGlobal('fetch', fetch);

    await expect(
      cartTransport().add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBe(saved);
  });

  it('aborts add when the canonical success belongs to another attempt', async () => {
    savePaymentHandoff();
    const saved = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
    const fetch = vi.fn(async () =>
      response({ attemptId: draftId, status: 'succeeded' }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      cartTransport().add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBe(saved);
  });

  it('fails closed on a malformed saved handoff before making any request', async () => {
    window.sessionStorage.setItem(PAYMENT_HANDOFF_KEY, '{not-json');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      cartTransport().add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBe(
      '{not-json',
    );
  });

  it('fails closed when the payment handoff cannot be read', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const storage = paymentStorage({
      getItem: () => {
        throw new Error('storage unavailable');
      },
    });

    await expect(
      cartTransport(storage).add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires the correlated success marker to persist before adding', async () => {
    savePaymentHandoff();
    const fetch = vi.fn(async () =>
      response({ attemptId, status: 'succeeded' }),
    );
    vi.stubGlobal('fetch', fetch);
    const setItem = vi.fn();
    const storage = paymentStorage({ setItem });

    await expect(
      cartTransport(storage).add('citra-hops', 100_000),
    ).rejects.toBeInstanceOf(CartTransportError);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(readSavedHandoff()).toEqual({
      attemptId,
      draftId,
      key: idempotencyKey,
    });
  });

  it('does not mark or mutate after the handoff is replaced during status preflight', async () => {
    savePaymentHandoff();
    let resolveStatus!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveStatus = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const add = cartTransport().add('citra-hops', 100_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const replacement = {
      attemptId: '60000000-0000-4000-8000-000000000001',
      draftId: '70000000-0000-4000-8000-000000000001',
      key: '80000000-0000-4000-8000-000000000001',
    };
    window.sessionStorage.setItem(
      PAYMENT_HANDOFF_KEY,
      JSON.stringify(replacement),
    );
    resolveStatus(response({ attemptId, status: 'succeeded' }));

    await expect(add).rejects.toBeInstanceOf(CartTransportError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readSavedHandoff()).toEqual(replacement);
  });

  it('bypasses status preflight for a verified success marker', async () => {
    savePaymentHandoff({ settled: 'succeeded' });
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', fetch);

    await expect(cartTransport().add('citra-hops', 100_000)).resolves.toEqual(
      cart,
    );

    expect(requestUrls(fetch)).toEqual([
      'http://api:3001/api/v1/cart/csrf',
      'http://api:3001/api/v1/cart/items',
    ]);
  });

  it('keeps the success marker after a response-lost add and bypasses status on an explicit retry', async () => {
    savePaymentHandoff();
    const firstFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(response({ attemptId, status: 'succeeded' }))
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockRejectedValueOnce(new TypeError('add response lost'));
    vi.stubGlobal('fetch', firstFetch);

    await expect(cartTransport().add('citra-hops', 100_000)).rejects.toThrow(
      'add response lost',
    );
    expect(requestUrls(firstFetch)).toEqual([
      'http://api:3001/api/v1/payments/stripe/status',
      'http://api:3001/api/v1/cart/csrf',
      'http://api:3001/api/v1/cart/items',
    ]);
    expect(readSavedHandoff()).toMatchObject({ settled: 'succeeded' });

    const retryFetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(response(undefined, 401))
      .mockResolvedValueOnce(response(cart));
    vi.stubGlobal('fetch', retryFetch);

    await expect(cartTransport().add('citra-hops', 100_000)).resolves.toEqual(
      cart,
    );
    expect(requestUrls(retryFetch)).toEqual([
      'http://api:3001/api/v1/cart/csrf',
      'http://api:3001/api/v1/cart/items',
    ]);
  });

  it('checks checkout readiness with a fresh CSRF token and private response handling', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(
        response({
          checkedAt: '2026-08-25T10:00:00.000Z',
          lines: [
            {
              outcome: 'available',
              productSlug: 'citra-hops',
              requestedAmount: 100_000,
            },
          ],
          status: 'ready',
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const transport = createBrowserCartTransport(
      () => 'http://localhost:3000',
      'http://api:3001',
    );
    expect(transport.checkoutReadiness).toBeTypeOf('function');

    await expect(transport.checkoutReadiness()).resolves.toEqual({
      checkedAt: '2026-08-25T10:00:00.000Z',
      lines: [
        {
          outcome: 'available',
          productSlug: 'citra-hops',
          requestedAmount: 100_000,
        },
      ],
      status: 'ready',
    });

    const readinessRequest = fetch.mock.calls[1]?.[0] as Request;
    expect(readinessRequest.method).toBe('POST');
    expect(readinessRequest.url).toBe(
      'http://api:3001/api/v1/cart/checkout-readiness',
    );
    expect(readinessRequest.cache).toBe('no-store');
    expect(readinessRequest.credentials).toBe('include');
    expect(readinessRequest.headers.get('origin')).toBe(
      'http://localhost:3000',
    );
    expect(readinessRequest.headers.get('x-csrf-token')).toBe(csrfToken);
    expect(readinessRequest.headers.get('content-type')).toBeNull();
    await expect(readinessRequest.clone().text()).resolves.toBe('');
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

function cartTransport(
  paymentHandoffStorage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>,
) {
  return createBrowserCartTransport(
    () => 'http://localhost:3000',
    'http://api:3001',
    '',
    paymentHandoffStorage,
  );
}

function paymentStorage(
  overrides: Partial<Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>> = {},
) {
  return {
    getItem: window.sessionStorage.getItem.bind(window.sessionStorage),
    removeItem: window.sessionStorage.removeItem.bind(window.sessionStorage),
    setItem: window.sessionStorage.setItem.bind(window.sessionStorage),
    ...overrides,
  };
}

function savePaymentHandoff(
  overrides: Readonly<{ settled?: 'succeeded' }> = {},
) {
  window.sessionStorage.setItem(
    PAYMENT_HANDOFF_KEY,
    JSON.stringify({
      attemptId,
      draftId,
      key: idempotencyKey,
      ...overrides,
    }),
  );
}

function readSavedHandoff() {
  const saved = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
  return saved === null ? null : JSON.parse(saved);
}

function requestUrls(fetch: ReturnType<typeof vi.fn>) {
  return fetch.mock.calls.map(([request]) => (request as Request).url);
}
