import type { ClientOptions } from 'openapi-fetch';
import {
  createApiClient,
  normalizeCatalogResponse,
  type ApiClientOptions,
  type CatalogCompatibilityResult,
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

const normalized: CatalogCompatibilityResult = normalizeCatalogResponse([]);
void normalized;
