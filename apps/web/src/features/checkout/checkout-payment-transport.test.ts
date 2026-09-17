import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CheckoutPaymentTransportError,
  createBrowserCheckoutPaymentTransport,
} from './checkout-payment-transport';

const csrfToken = `ci-v1.${'A'.repeat(43)}`;
const attemptId = '20000000-0000-4000-8000-000000000001';
const checkoutDraftId = '10000000-0000-4000-8000-000000000001';
const idempotencyKey = 'checkout-00000000-0000-4000-8000-000000000001';
const checkoutSession = {
  attemptId,
  checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_safe',
  expiresAt: '2026-09-17T12:00:00.000Z',
  status: 'ready_for_redirect' as const,
};
const paymentStatus = { attemptId, status: 'processing' as const };
const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
};

afterEach(() => vi.unstubAllGlobals());

describe('checkout payment browser transport', () => {
  it('starts one hosted Checkout attempt with fresh CSRF and the caller idempotency key', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse(checkoutSession));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).start(checkoutDraftId, idempotencyKey),
    ).resolves.toEqual(checkoutSession);

    expect(fetch).toHaveBeenCalledTimes(2);
    const csrfRequest = fetch.mock.calls[0]?.[0];
    const startRequest = fetch.mock.calls[1]?.[0];
    expect(csrfRequest?.url).toBe('http://api:3001/api/v1/cart/csrf');
    expect(csrfRequest?.credentials).toBe('include');
    expect(csrfRequest?.cache).toBe('no-store');
    expect(startRequest?.url).toBe(
      'http://api:3001/api/v1/payments/stripe/checkout-session',
    );
    expect(startRequest?.method).toBe('POST');
    expect(startRequest?.credentials).toBe('include');
    expect(startRequest?.cache).toBe('no-store');
    expect(startRequest?.redirect).toBe('error');
    expect(startRequest?.headers.get('origin')).toBe('http://localhost:3000');
    expect(startRequest?.headers.get('x-csrf-token')).toBe(csrfToken);
    expect(startRequest?.headers.get('idempotency-key')).toBe(idempotencyKey);
    await expect(startRequest?.clone().json()).resolves.toEqual({
      checkoutDraftId,
    });
  });

  it('reads a valid private canonical status without a mutation preflight', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse(paymentStatus),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).status(),
    ).resolves.toEqual(paymentStatus);

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.url).toBe('http://api:3001/api/v1/payments/stripe/status');
    expect(request?.method).toBe('GET');
    expect(request?.credentials).toBe('include');
  });

  it('returns null only when canonical status is privately absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(undefined, 404)),
    );

    await expect(
      createBrowserCheckoutPaymentTransport().status(),
    ).resolves.toBeNull();
  });

  it('does not turn rejected private access into an absent payment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(undefined, 401)),
    );

    await expect(
      createBrowserCheckoutPaymentTransport().status(),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('reconciles once through the bodyless generated route with fresh CSRF', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(
        jsonResponse({ ...paymentStatus, status: 'succeeded' }),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).reconcile(),
    ).resolves.toEqual({ ...paymentStatus, status: 'succeeded' });

    expect(fetch).toHaveBeenCalledTimes(2);
    const request = fetch.mock.calls[1]?.[0];
    expect(request?.url).toBe(
      'http://api:3001/api/v1/payments/stripe/reconcile',
    );
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('origin')).toBe('http://localhost:3000');
    expect(request?.headers.get('x-csrf-token')).toBe(csrfToken);
    expect(request?.headers.get('content-type')).toBeNull();
    await expect(request?.clone().text()).resolves.toBe('');
  });

  it.each([
    'http://checkout.stripe.com/c/pay/cs_test_insecure',
    'https://checkout.stripe.com.evil.example/c/pay/cs_test_wrong_host',
    'https://user@checkout.stripe.com/c/pay/cs_test_userinfo',
    'https://checkout.stripe.com:8443/c/pay/cs_test_wrong_port',
  ])('rejects an unsafe hosted Checkout URL: %s', async (checkoutUrl) => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ ...checkoutSession, checkoutUrl }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport().start(
        checkoutDraftId,
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(CheckoutPaymentTransportError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { attemptId: 'not-a-uuid' },
    { expiresAt: '2026-02-30T12:00:00.000Z' },
    { status: 'processing' },
  ])('rejects an invalid hosted-session DTO: %o', async (override) => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ ...checkoutSession, ...override }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport().start(
        checkoutDraftId,
        idempotencyKey,
      ),
    ).rejects.toBeInstanceOf(CheckoutPaymentTransportError);
  });

  it('fails closed on an invalid runtime status DTO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ...paymentStatus, status: 'paid' })),
    );

    await expect(
      createBrowserCheckoutPaymentTransport().status(),
    ).rejects.toBeInstanceOf(CheckoutPaymentTransportError);
  });

  it('fails closed before treating a cacheable 404 as absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(undefined, { status: 404 })),
    );

    await expect(
      createBrowserCheckoutPaymentTransport().status(),
    ).rejects.toBeInstanceOf(CheckoutPaymentTransportError);
  });

  it('does not retry or replace the idempotency key when start is unavailable', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse(undefined, 503));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutPaymentTransport().start(
        checkoutDraftId,
        idempotencyKey,
      ),
    ).rejects.toMatchObject({ status: 503 });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0].headers.get('idempotency-key')).toBe(
      idempotencyKey,
    );
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    headers: privateHeaders,
    status,
  });
}
