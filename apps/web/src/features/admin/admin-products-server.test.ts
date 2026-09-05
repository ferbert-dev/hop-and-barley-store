import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ADMIN_PRODUCTS_REQUEST_TIMEOUT_MS,
  loadAdminProducts,
} from './admin-products-server';

const product = {
  activeFrom: null,
  activeUntil: null,
  amountUnit: 'MILLIGRAM',
  category: { name: 'Hops', slug: 'hops' },
  createdAt: '2026-08-28T10:00:00.000Z',
  currency: 'EUR',
  description: 'Citrus and floral whole-cone hops.',
  id: '20000000-0000-4000-8000-000000000002',
  imagePath: '/assets/products/cascade-hops.webp',
  isActive: true,
  lifecycleStatus: 'ACTIVE',
  name: 'Cascade Hops',
  priceMinor: 699,
  priceQualifier: 'per 100g',
  saleKind: 'WEIGHT',
  slug: 'cascade-hops',
  stockAmount: 100_000_000,
  updatedAt: '2026-08-28T10:00:00.000Z',
} as const;

const response = {
  items: [product],
  meta: {
    currency: 'EUR',
    facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
    filters: {
      category: null,
      lifecycle: null,
      maxPriceMinor: null,
      minPriceMinor: null,
      search: null,
    },
    hasNextPage: false,
    hasPreviousPage: false,
    limit: 12,
    page: 1,
    sort: 'name-asc',
    totalItems: 1,
    totalPages: 1,
  },
} as const;

const query = { limit: 12, page: 1, sort: 'name-asc' as const };
const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
  vary: 'Cookie, Origin',
};

afterEach(() => vi.unstubAllGlobals());

describe('admin products server transport', () => {
  it('uses only the selected session cookie with no-store and the generated route', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse(response, 200),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadAdminProducts(
        'hb_session=session-value',
        query,
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'loaded', products: response });

    const [request] = fetch.mock.calls[0] ?? [];
    expect(request?.url).toBe(
      'http://api:3001/api/v1/admin/products?limit=12&page=1&sort=name-asc',
    );
    expect(request?.cache).toBe('no-store');
    expect(request?.headers.get('cookie')).toBe('hb_session=session-value');
    expect(ADMIN_PRODUCTS_REQUEST_TIMEOUT_MS).toBe(1_500);
  });

  it.each([
    ['a cacheable response', jsonResponse(response, 200, {})],
    ['a malformed response', jsonResponse({ items: [] }, 200)],
    [
      'an upstream failure',
      new Response(null, { headers: privateHeaders, status: 503 }),
    ],
  ])('fails closed for %s', async (_name, upstream) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => upstream),
    );

    await expect(
      loadAdminProducts('hb_session=session-value', query),
    ).resolves.toEqual({ kind: 'unavailable' });
  });

  it('keeps expired sessions and forbidden access distinct for the route boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { headers: privateHeaders, status: 401 }),
        )
        .mockResolvedValueOnce(
          new Response(null, { headers: privateHeaders, status: 403 }),
        ),
    );

    await expect(
      loadAdminProducts('hb_session=session-value', query),
    ).resolves.toEqual({ kind: 'anonymous' });
    await expect(
      loadAdminProducts('hb_session=session-value', query),
    ).resolves.toEqual({ kind: 'denied' });
  });
});

function jsonResponse(
  body: unknown,
  status: number,
  headers: HeadersInit = privateHeaders,
) {
  return new Response(JSON.stringify(body), { headers, status });
}
