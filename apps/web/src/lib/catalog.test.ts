import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CATALOG_REQUEST_TIMEOUT_MS,
  loadCatalog,
  resolveApiOrigin,
} from './catalog';

const legacyItem = {
  currency: 'USD',
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
  priceQualifier: 'per 100g',
  teaser: 'Citrus and floral whole-cone hops.',
};

const meta = {
  currency: 'USD',
  facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
  filters: {
    category: null,
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

  it('uses the generated path once with no-store and normalizes the envelope', async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe('http://api:3001/api/v1/products');
      expect(request.cache).toBe('no-store');
      expect(request.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ items: [pagedItem], meta });
    });
    vi.stubGlobal('fetch', fetch);

    await expect(loadCatalog('http://api:3001/api/v1')).resolves.toMatchObject({
      catalog: { items: [pagedItem], kind: 'paged', meta },
      connected: true,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps the exact legacy array rollback branch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([legacyItem])),
    );

    await expect(loadCatalog('http://127.0.0.1:3001')).resolves.toEqual({
      catalog: {
        capabilities: { facets: 'unavailable', pagination: 'unavailable' },
        items: [legacyItem],
        kind: 'legacy',
        meta: null,
      },
      connected: true,
    });
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
