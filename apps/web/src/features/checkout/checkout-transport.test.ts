import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CheckoutTransportError,
  createBrowserCheckoutTransport,
} from './checkout-transport';

const draft = {
  currency: 'EUR' as const,
  delivery: {
    additionalInfo: null,
    administrativeArea: 'BE',
    apartmentUnit: null,
    city: 'Berlin',
    countryCode: 'DE',
    floor: null,
    houseNumber: '4',
    postalCode: '10115',
    street: 'Hopfenstraße',
  },
  email: 'brewer@example.com',
  expiresAt: '2026-09-10T10:00:00.000Z',
  fullName: 'Alex Brewer',
  itemSubtotalMinor: 599,
  paymentMethod: 'stripe_debit_card' as const,
  phoneNumber: '+4912345678',
  quoteStatus: 'ready' as const,
  quotedAt: '2026-09-09T10:00:00.000Z',
  shippingMinor: 500,
  status: 'pre_payment' as const,
  totalMinor: 1099,
  updatedAt: '2026-09-09T10:00:00.000Z',
};

const privateHeaders = { 'cache-control': 'private, no-store' };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: privateHeaders, status });

afterEach(() => vi.unstubAllGlobals());

describe('checkout draft browser transport', () => {
  it('loads a guest draft using cookie credentials without exposing a capability', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      response(draft),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserCheckoutTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).loadDraft(),
    ).resolves.toEqual(draft);

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('http://api:3001/api/v1/checkout/draft');
    expect(request.credentials).toBe('include');
    expect(request.headers.get('cookie')).toBeNull();
  });

  it('treats an absent or expired private draft as an empty form state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(undefined, 404)),
    );

    await expect(
      createBrowserCheckoutTransport().loadDraft(),
    ).resolves.toBeNull();
  });

  it('saves through the generated route with fresh CSRF, origin and idempotency headers', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(response(draft));
    vi.stubGlobal('fetch', fetch);
    const body = {
      delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
      email: 'brewer@example.com',
      fullName: 'Alex Brewer',
      paymentMethod: 'stripe_debit_card' as const,
      phoneNumber: '+4912345678',
    };

    await expect(
      createBrowserCheckoutTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).saveDraft(body, 'checkout-00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual(draft);

    const request = fetch.mock.calls[1]?.[0] as Request;
    expect(request.method).toBe('POST');
    expect(request.url).toBe('http://api:3001/api/v1/checkout/draft');
    expect(request.headers.get('origin')).toBe('http://localhost:3000');
    expect(request.headers.get('x-csrf-token')).toBe(csrfToken);
    expect(request.headers.get('idempotency-key')).toBe(
      'checkout-00000000-0000-4000-8000-000000000001',
    );
    await expect(request.clone().json()).resolves.toEqual(body);
  });

  it('fails closed when draft data is cacheable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(draft), { status: 200 })),
    );

    await expect(
      createBrowserCheckoutTransport().loadDraft(),
    ).rejects.toBeInstanceOf(CheckoutTransportError);
  });
});
