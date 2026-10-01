import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserLikesTransport,
  LikesTransportError,
} from './likes-transport';

const attemptId = '40000000-0000-4000-8000-000000000001';
const csrfToken = `cart-v1.${'A'.repeat(43)}`;

afterEach(() => vi.unstubAllGlobals());

describe('likes browser transport', () => {
  it('reads the public aggregate without a mutation preflight', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse({ count: 12 }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserLikesTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).count(),
    ).resolves.toEqual({ count: 12 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.url).toBe('http://api:3001/api/v1/likes');
    expect(request?.method).toBe('GET');
    expect(request?.credentials).toBe('include');
    expect(request?.cache).toBe('no-store');
  });

  it('creates a Like only after fetching CSRF and sends the exact attempt ID', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ count: 13, liked: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserLikesTransport(
        () => 'http://localhost:3000',
        'http://api:3001',
      ).create(attemptId),
    ).resolves.toEqual({ count: 13, liked: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0].url).toBe(
      'http://api:3001/api/v1/cart/csrf',
    );
    const request = fetch.mock.calls[1]?.[0];
    expect(request?.url).toBe('http://api:3001/api/v1/likes');
    expect(request?.method).toBe('POST');
    expect(request?.credentials).toBe('include');
    expect(request?.headers.get('origin')).toBe('http://localhost:3000');
    expect(request?.headers.get('x-csrf-token')).toBe(csrfToken);
    await expect(request?.clone().json()).resolves.toEqual({
      paymentAttemptId: attemptId,
    });
  });

  it('fails closed when the mutation response does not confirm the Like', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }))
      .mockResolvedValueOnce(jsonResponse({ count: 13 }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createBrowserLikesTransport().create(attemptId),
    ).rejects.toBeInstanceOf(LikesTransportError);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
