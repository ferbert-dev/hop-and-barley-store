import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CatalogResponseShapeError,
  createApiClient,
  normalizeCatalogResponse,
} from '../dist/index.js';

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
  amountUnit: 'MILLIGRAM',
  availability: 'in-stock',
  category: { name: 'Hops', slug: 'hops' },
  imagePath: '/assets/products/cascade-hops.webp',
  kitYieldVolumeMl: null,
  maximumOrderAmount: null,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  priceQualifier: 'per 100g',
  saleKind: 'WEIGHT',
  stockAmount: 100_000_000,
  teaser: 'Citrus and floral whole-cone hops.',
};

const meta = {
  currency: 'USD',
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

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

test('createApiClient keeps its one-argument API', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...arguments_) => {
    calls.push(arguments_);
    return jsonResponse([legacyItem]);
  };

  try {
    const client = createApiClient('https://api.example.test');
    const result = await client.GET('/api/v1/products');

    assert.deepEqual(result.data, [legacyItem]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].url, 'https://api.example.test/api/v1/products');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('createApiClient forwards no-store and catalog query exactly', async () => {
  const calls = [];
  const fetch = async (...arguments_) => {
    calls.push(arguments_);
    return jsonResponse({ items: [pagedItem], meta });
  };
  const client = createApiClient('https://api.example.test', {
    cache: 'no-store',
    fetch,
  });

  await client.GET('/api/v1/products', {
    params: {
      query: {
        category: ['hops'],
        limit: 12,
        maxPriceMinor: 900,
        minPriceMinor: 100,
        page: 2,
        search: 'citrus hops',
        sort: 'price-desc',
      },
    },
  });

  assert.equal(calls.length, 1);
  const [request, extension] = calls[0];
  assert.equal(request.cache, 'no-store');
  assert.equal(extension, undefined);
  const url = new URL(request.url);
  assert.equal(url.pathname, '/api/v1/products');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    category: 'hops',
    limit: '12',
    maxPriceMinor: '900',
    minPriceMinor: '100',
    page: '2',
    search: 'citrus hops',
    sort: 'price-desc',
  });
});

test('createApiClient preserves requestInitExt for a future cached Next caller', async () => {
  const calls = [];
  const requestInitExt = { next: { revalidate: 60 } };
  const fetch = async (...arguments_) => {
    calls.push(arguments_);
    return jsonResponse({ items: [pagedItem], meta });
  };
  const client = createApiClient('https://api.example.test', {
    fetch,
    requestInitExt,
  });

  await client.GET('/api/v1/products');

  assert.equal(calls.length, 1);
  const [request, extension] = calls[0];
  assert.equal(request.cache, 'default');
  assert.deepEqual(extension, requestInitExt);
});

test('normalizer returns an honest legacy branch without invented capabilities', () => {
  const result = normalizeCatalogResponse([
    { ...legacyItem, additiveFutureField: true },
  ]);

  assert.deepEqual(result, {
    capabilities: { facets: 'unavailable', pagination: 'unavailable' },
    items: [legacyItem],
    kind: 'legacy',
    meta: null,
  });
});

test('normalizer rejects an array item containing any known paged-only key', () => {
  const pagedOnlyValues = {
    availability: 'in-stock',
    category: { name: 'Hops', slug: 'hops' },
    imagePath: '/assets/products/cascade-hops.webp',
    priceQualifier: 'per 100g',
    teaser: 'Citrus and floral whole-cone hops.',
  };

  for (const [key, value] of Object.entries(pagedOnlyValues)) {
    assert.throws(
      () => normalizeCatalogResponse([{ ...legacyItem, [key]: value }]),
      CatalogResponseShapeError,
    );
  }
});

test('normalizer rejects prohibited persistence fields in a legacy array', () => {
  const persistenceValues = {
    categoryId: '10000000-0000-4000-8000-000000000001',
    isActive: true,
    stockAmount: 100,
    stockQuantity: 100,
  };

  for (const [key, value] of Object.entries(persistenceValues)) {
    assert.throws(
      () => normalizeCatalogResponse([{ ...legacyItem, [key]: value }]),
      CatalogResponseShapeError,
    );
  }
});

test('normalizer returns a validated paged branch and tolerates additive fields', () => {
  const result = normalizeCatalogResponse({
    additiveEnvelopeField: true,
    items: [
      {
        ...pagedItem,
        additiveItemField: true,
        category: { ...pagedItem.category, additiveCategoryField: true },
      },
    ],
    meta: {
      ...meta,
      additiveMetaField: true,
      facets: {
        additiveFacetField: true,
        categories: [
          { ...meta.facets.categories[0], additiveCategoryField: true },
        ],
      },
    },
  });

  assert.equal(result.kind, 'paged');
  assert.deepEqual(result.capabilities, {
    facets: 'available',
    pagination: 'available',
  });
  assert.deepEqual(result.items, [pagedItem]);
  assert.deepEqual(result.meta, meta);
});

test('normalizer accepts only opaque UUID-v4 dynamic product image paths', () => {
  const imagePath = '/product-assets/123e4567-e89b-42d3-a456-426614174000.webp';
  const result = normalizeCatalogResponse({
    items: [{ ...pagedItem, imagePath }],
    meta,
  });

  assert.equal(result.kind, 'paged');
  assert.equal(result.items[0].imagePath, imagePath);

  for (const invalidPath of [
    '/product-assets/../secret.webp',
    '/product-assets/123e4567-e89b-12d3-a456-426614174000.webp',
    '/product-assets/123e4567-e89b-42d3-c456-426614174000.webp',
    '/product-assets/123e4567-e89b-42d3-a456-426614174000.png',
  ]) {
    assert.throws(
      () =>
        normalizeCatalogResponse({
          items: [{ ...pagedItem, imagePath: invalidPath }],
          meta,
        }),
      CatalogResponseShapeError,
    );
  }
});

test('normalizer rejects malformed common, paged and nested structures', () => {
  const malformed = [
    null,
    {},
    { items: [] },
    { items: 'not-an-array', meta },
    [{ ...legacyItem, id: undefined }],
    [{ ...legacyItem, priceMinor: '699' }],
    [{ ...legacyItem, currency: 'EUR' }],
    { items: [{ ...pagedItem, availability: 'unknown' }], meta },
    { items: [{ ...pagedItem, category: null }], meta },
    { items: [{ ...pagedItem, imagePath: undefined }], meta },
    { items: [pagedItem], meta: { ...meta, filters: null } },
    { items: [pagedItem], meta: { ...meta, facets: null } },
    {
      items: [pagedItem],
      meta: {
        ...meta,
        filters: { ...meta.filters, search: 'hops\u00a0fresh' },
      },
    },
    {
      items: [pagedItem],
      meta: { ...meta, facets: { categories: [{ name: 'Hops' }] } },
    },
    { items: [pagedItem], meta: { ...meta, totalPages: 2 } },
    { items: [pagedItem], meta: { ...meta, hasNextPage: true } },
    {
      items: [],
      meta: { ...meta, totalItems: 1 },
    },
    {
      items: [pagedItem],
      meta: {
        ...meta,
        hasPreviousPage: true,
        page: 2,
        totalItems: 1,
        totalPages: 1,
      },
    },
  ];

  for (const value of malformed) {
    assert.throws(
      () => normalizeCatalogResponse(value),
      CatalogResponseShapeError,
    );
  }
});
