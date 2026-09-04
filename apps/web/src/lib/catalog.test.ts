import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CATALOG_REQUEST_TIMEOUT_MS,
  loadCatalog,
  resolveApiOrigin,
} from './catalog';
import { DEFAULT_CATALOG_QUERY } from '../features/catalog/catalog-query';

const legacyItem = {
  currency: 'EUR',
  description: 'Bright whole-cone hops',
  id: '20000000-0000-4000-8000-000000000002',
  name: 'Cascade Hops',
  priceMinor: 699,
  slug: 'cascade-hops',
};

const pagedItem = {
  ...legacyItem,
  availability: 'in-stock',
  category: { name: 'Hops', slug: 'hops' },
  imagePath: '/assets/products/cascade-hops.webp',
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  priceQualifier: 'per 100g',
  saleKind: 'WEIGHT',
  stockAmount: 100_000_000,
  amountUnit: 'MILLIGRAM',
  teaser: 'Citrus and floral whole-cone hops.',
};

const meta = {
  currency: 'EUR',
  facets: { categories: [{ count: 1, name: 'Hops', slug: 'hops' }] },
  filters: {
    category: [],
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
};

const predecessorMeta = {
  ...meta,
  facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
  filters: { ...meta.filters, category: 'hops' },
};

afterEach(() => vi.unstubAllGlobals());

describe('resolveApiOrigin', () => {
  it.each([
    ['http://127.0.0.1:3001', 'http://127.0.0.1:3001'],
    ['http://api:3001/api/v1', 'http://api:3001'],
    ['https://api.example.test/', 'https://api.example.test'],
    ['https://api.example.test/api/v1/', 'https://api.example.test'],
  ])(
    'normalizes %s without duplicating the generated path',
    (input, expected) => {
      expect(resolveApiOrigin(input)).toBe(expected);
    },
  );

  it.each([
    'ftp://api.example.test',
    'https://user:secret@api.example.test',
    'https://api.example.test/api',
    'https://api.example.test/api/v1/products',
    'https://api.example.test/api/v1?debug=1',
    'https://api.example.test/api/v1#fragment',
    '/api/v1',
  ])('rejects ambiguous or unsafe URL %s', (input) => {
    expect(() => resolveApiOrigin(input)).toThrow(TypeError);
  });
});

describe('loadCatalog', () => {
  it('bounds the internal API request so an unavailable service fails fast', () => {
    expect(CATALOG_REQUEST_TIMEOUT_MS).toBe(1_000);
  });

  it('uses the typed query once with 60-second revalidation and a bounded request', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ items: [pagedItem], meta }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadCatalog(
        { category: ['hops'], limit: 12, page: 1, sort: 'name-asc' },
        'http://api:3001/api/v1',
      ),
    ).resolves.toMatchObject({
      catalog: {
        items: [expect.objectContaining({ id: pagedItem.id })],
        kind: 'paged',
        meta,
      },
      connected: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [request, init] = fetch.mock.calls[0] as unknown as [
      Request,
      RequestInit,
    ];
    expect(request.url).toBe(
      'http://api:3001/api/v1/products?category=hops&limit=12&page=1&sort=name-asc',
    );
    expect(request.cache).toBe('default');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(init).toEqual({ next: { revalidate: 60 } });
  });

  it('keeps the exact legacy array rollback branch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([legacyItem])),
    );

    await expect(
      loadCatalog(DEFAULT_CATALOG_QUERY, 'http://127.0.0.1:3001'),
    ).resolves.toEqual({
      catalog: {
        capabilities: { facets: 'unavailable', pagination: 'unavailable' },
        items: [legacyItem],
        kind: 'legacy',
        meta: null,
      },
      connected: true,
    });
  });

  it('retries a repeated category as one category only for the immediate predecessor', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({ items: [pagedItem], meta: predecessorMeta }),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadCatalog(
        {
          category: ['hops', 'malts'],
          limit: 12,
          page: 1,
          sort: 'name-asc',
        },
        'http://api:3001',
      ),
    ).resolves.toMatchObject({
      catalog: { kind: 'paged-predecessor' },
      connected: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[0]?.[0] as Request).url).toContain(
      'category=hops&category=malts',
    );
    expect((fetch.mock.calls[1]?.[0] as Request).url).toContain(
      'category=hops',
    );
    expect((fetch.mock.calls[1]?.[0] as Request).url).not.toContain(
      'category=malts',
    );
  });

  it('does not disguise a current API failure as predecessor compatibility', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ items: [pagedItem], meta }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadCatalog({ ...DEFAULT_CATALOG_QUERY, category: ['hops', 'malts'] }),
    ).resolves.toEqual({ catalog: null, connected: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['malformed payload', () => Response.json({ items: [] })],
    ['HTTP failure', () => new Response(null, { status: 503 })],
  ])('fails closed as unavailable for %s', async (_name, response) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    );

    await expect(loadCatalog()).resolves.toEqual({
      catalog: null,
      connected: false,
    });
  });
});
