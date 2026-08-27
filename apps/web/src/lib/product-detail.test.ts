import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PRODUCT_DETAIL_REQUEST_TIMEOUT_MS,
  loadProductDetail,
} from './product-detail';

const product = {
  availability: 'in-stock' as const,
  category: { name: 'Hops', slug: 'hops' },
  currency: 'USD' as const,
  description: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  id: '20000000-0000-4000-8000-000000000001',
  imagePath: '/assets/products/citra-hops.webp',
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  name: 'Citra Hops',
  orderStepAmount: 5_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  priceMinor: 599,
  priceQualifier: 'per 100g',
  slug: 'citra-hops',
  saleKind: 'WEIGHT' as const,
  stockAmount: 100_000_000,
  amountUnit: 'MILLIGRAM' as const,
  specifications: [
    { label: 'Origin', value: 'USA' },
    { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
  ],
  teaser: 'Ideal for IPAs and Pale Ales',
};

afterEach(() => vi.unstubAllGlobals());

describe('loadProductDetail', () => {
  it('uses the generated detail path with 60-second revalidation and a bounded request', async () => {
    const fetch = vi.fn(async () => Response.json(product));
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadProductDetail('citra-hops', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'ready', product });
    expect(PRODUCT_DETAIL_REQUEST_TIMEOUT_MS).toBe(1_000);
    expect(fetch).toHaveBeenCalledOnce();
    const [request, extension] = fetch.mock.calls[0] as unknown as [
      Request,
      RequestInit,
    ];
    expect(request.url).toBe('http://api:3001/api/v1/products/citra-hops');
    expect(request.cache).toBe('default');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(extension).toEqual({ next: { revalidate: 60 } });
  });

  it('distinguishes a public 404 from an unavailable API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadProductDetail('missing-product')).resolves.toEqual({
      kind: 'not-found',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(loadProductDetail('citra-hops')).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('projects additive response fields without leaking nested persistence data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ...product,
          additiveFutureField: 'ignored',
          category: { ...product.category, displayOrder: 1 },
          specifications: product.specifications.map((specification) => ({
            ...specification,
            internalOrder: 1,
          })),
        }),
      ),
    );

    await expect(loadProductDetail('citra-hops')).resolves.toEqual({
      kind: 'ready',
      product,
    });
  });

  it.each([
    null,
    {},
    { ...product, stockQuantity: 100 },
    { ...product, categoryId: 'private-category-id' },
    { ...product, isActive: true },
    { ...product, currency: 'EUR' },
    { ...product, specifications: {} },
    { ...product, specifications: [] },
    { ...product, specifications: [{ label: 'Origin', value: [] }] },
  ])(
    'fails malformed or persistence-leaking payloads closed: %j',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(body)),
      );

      await expect(loadProductDetail('citra-hops')).resolves.toEqual({
        kind: 'unavailable',
      });
    },
  );
});
