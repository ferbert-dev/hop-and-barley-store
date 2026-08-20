import type { ClientOptions } from 'openapi-fetch';
import {
  createApiClient,
  normalizeCatalogResponse,
  type ApiClientOptions,
  type CatalogCompatibilityResult,
  type components,
} from '../src/index.js';

const options: ApiClientOptions = { cache: 'no-store' };
const optionsRemainClientOptions: Omit<ClientOptions, 'baseUrl'> = options;
void optionsRemainClientOptions;

const legacyClient = createApiClient('https://api.example.test');
const configuredClient = createApiClient('https://api.example.test', options);
const futureCachedClient = createApiClient('https://api.example.test', {
  requestInitExt: { next: { revalidate: 60 } },
});
void legacyClient;
void futureCachedClient;

const request = configuredClient.GET('/api/v1/products', {
  params: {
    query: {
      category: 'hops',
      limit: 12,
      maxPriceMinor: 900,
      minPriceMinor: 100,
      page: 1,
      search: 'citrus hops',
      sort: 'price-asc',
    },
  },
});
void request;

const detailRequest = configuredClient.GET('/api/v1/products/{slug}', {
  params: { path: { slug: 'citra-hops' } },
});
void detailRequest;

const detail: components['schemas']['ProductDetailDto'] = {
  availability: 'in-stock',
  category: { name: 'Hops', slug: 'hops' },
  currency: 'USD',
  description: 'Three-paragraph detail copy',
  id: '20000000-0000-4000-8000-000000000001',
  imagePath: '/assets/products/citra-hops.webp',
  name: 'Citra Hops',
  priceMinor: 599,
  priceQualifier: 'per 100g',
  slug: 'citra-hops',
  specifications: [
    { label: 'Origin', value: 'USA' },
    { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
  ],
  teaser: 'Ideal for IPAs and Pale Ales',
};
void detail;

const normalized: CatalogCompatibilityResult = normalizeCatalogResponse([]);
void normalized;
