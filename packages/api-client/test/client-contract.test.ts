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

const registrationRequest = configuredClient.POST('/api/v1/auth/register', {
  body: {
    email: 'brewer@example.com',
    password: 'Abcdefghi1!x',
  },
});
void registrationRequest;

const loginRequest = configuredClient.POST('/api/v1/auth/login', {
  body: {
    email: 'brewer@example.com',
    password: 'correct-password-value',
  },
  params: { header: { Origin: 'http://localhost:3000' } },
});
void loginRequest;

const currentSessionRequest = configuredClient.GET('/api/v1/auth/session');
const csrfRequest = configuredClient.GET('/api/v1/auth/csrf');
const logoutRequest = configuredClient.POST('/api/v1/auth/logout', {
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `v1.${'A'.repeat(43)}`,
    },
  },
});
void currentSessionRequest;
void csrfRequest;
void logoutRequest;

const cartRequest = configuredClient.GET('/api/v1/cart');
const cartCsrfRequest = configuredClient.GET('/api/v1/cart/csrf');
const firstCartAdd = configuredClient.POST('/api/v1/cart/items', {
  body: { productSlug: 'cascade-hops', quantity: 2 },
  params: { header: { Origin: 'http://localhost:3000' } },
});
const existingCartAdd = configuredClient.POST('/api/v1/cart/items', {
  body: { productSlug: 'cascade-hops', quantity: 1 },
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
    },
  },
});
const cartPatch = configuredClient.PATCH('/api/v1/cart/items/{productSlug}', {
  body: { quantity: 3 },
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
    },
    path: { productSlug: 'cascade-hops' },
  },
});
const cartDelete = configuredClient.DELETE('/api/v1/cart/items/{productSlug}', {
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
    },
    path: { productSlug: 'cascade-hops' },
  },
});
const cartClear = configuredClient.DELETE('/api/v1/cart/items', {
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
    },
  },
});
void cartRequest;
void cartCsrfRequest;
void firstCartAdd;
void existingCartAdd;
void cartPatch;
void cartDelete;
void cartClear;

const safeCart: components['schemas']['CartDto'] = {
  checkoutEligible: true,
  currency: 'USD',
  distinctItemCount: 1,
  items: [
    {
      availability: 'available',
      currentUnitPriceMinor: 699,
      imagePath: '/assets/products/cascade-hops.webp',
      lineTotalMinor: 1398,
      name: 'Cascade Hops',
      priceQualifier: 'per pound',
      productId: '20000000-0000-4000-8000-000000000002',
      productSlug: 'cascade-hops',
      quantity: 2,
    },
  ],
  subtotalMinor: 1398,
  totalQuantity: 2,
};
void safeCart;

const safeSession: components['schemas']['AuthSessionDto'] = {
  absoluteExpiresAt: '2026-08-29T10:00:00.000Z',
  idleExpiresAt: '2026-08-23T10:00:00.000Z',
  issuedAt: '2026-08-22T10:00:00.000Z',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  },
};
void safeSession;

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
