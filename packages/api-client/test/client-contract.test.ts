import type { ClientOptions } from 'openapi-fetch';
import {
  createApiClient,
  normalizeCatalogResponse,
  type ApiClientOptions,
  type CatalogCompatibilityResult,
  type components,
} from '../src/index.js';
import type { paths } from '../src/generated/schema.js';

type RemovedCartRoutes = '/api/v1/cart/recheck' extends keyof paths
  ? false
  : true;
type RemovedCartFields =
  Extract<
    keyof components['schemas']['CartDto'],
    'adjustmentMessage' | 'checkoutEligible' | 'serverNow'
  > extends never
    ? true
    : false;
type RemovedCartItemFields =
  Extract<
    keyof components['schemas']['CartItemDto'],
    'availability' | 'reservationExpiresAt' | 'reservationStatus'
  > extends never
    ? true
    : false;

const cartRecheckWasRemoved: RemovedCartRoutes = true;
const reservationDerivedCartFieldsWereRemoved: RemovedCartFields = true;
const reservationDerivedCartItemFieldsWereRemoved: RemovedCartItemFields = true;
void cartRecheckWasRemoved;
void reservationDerivedCartFieldsWereRemoved;
void reservationDerivedCartItemFieldsWereRemoved;

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
  body: { productSlug: 'cascade-hops', amount: 2 },
  params: { header: { Origin: 'http://localhost:3000' } },
});
const existingCartAdd = configuredClient.POST('/api/v1/cart/items', {
  body: { productSlug: 'cascade-hops', amount: 1 },
  params: {
    header: {
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
    },
  },
});
const cartPatch = configuredClient.PATCH('/api/v1/cart/items/{productSlug}', {
  body: { amount: 3 },
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
const checkoutReadiness = configuredClient.POST(
  '/api/v1/cart/checkout-readiness',
  {
    params: {
      header: {
        Origin: 'http://localhost:3000',
        'X-CSRF-Token': `cart-v1.${'A'.repeat(43)}`,
      },
    },
  },
);
void cartRequest;
void cartCsrfRequest;
void firstCartAdd;
void existingCartAdd;
void cartPatch;
void cartDelete;
void cartClear;
void checkoutReadiness;

const createOrder = configuredClient.POST('/api/v1/orders', {
  body: {
    city: 'Portland',
    fullName: 'Ada Brewer',
    items: [{ productSlug: 'cascade-hops', amount: 2 }],
    paymentMethod: 'cash_on_delivery',
    phoneNumber: '+1 555 0100',
    shippingAddress: '10 Brewery Lane',
  },
  params: {
    header: {
      'Idempotency-Key': 'checkout-order-0001',
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': `v1.${'A'.repeat(43)}`,
    },
  },
});
void createOrder;

const safeOrder: components['schemas']['OrderDto'] = {
  currency: 'USD',
  id: '60000000-0000-4000-8000-000000000001',
  itemSubtotalMinor: 1398,
  items: [
    {
      amountUnit: 'EACH',
      lineTotalMinor: 1398,
      priceBasisAmount: 1,
      priceQualifier: 'per pound',
      productName: 'Cascade Hops',
      productSlug: 'cascade-hops',
      amount: 2,
      priceMinor: 699,
      saleKind: 'PACKAGE',
    },
  ],
  paidAt: null,
  paymentMethod: 'cash_on_delivery',
  paymentState: 'due_on_delivery',
  placedAt: '2026-08-26T12:01:00.000Z',
  shipping: {
    city: 'Portland',
    fullName: 'Ada Brewer',
    phoneNumber: '+1 555 0100',
    shippingAddress: '10 Brewery Lane',
  },
  shippingMinor: 500,
  status: 'placed',
  totalMinor: 1898,
};
void safeOrder;

const safeCart: components['schemas']['CartDto'] = {
  currency: 'USD',
  distinctItemCount: 1,
  items: [
    {
      amountUnit: 'EACH',
      kitYieldVolumeMl: null,
      maximumOrderAmount: null,
      minimumOrderAmount: 1,
      orderStepAmount: 1,
      packageNetWeightMg: null,
      priceMinor: 699,
      priceBasisAmount: 1,
      imagePath: '/assets/products/cascade-hops.webp',
      lineTotalMinor: 1398,
      name: 'Cascade Hops',
      priceQualifier: 'per pound',
      productId: '20000000-0000-4000-8000-000000000002',
      productSlug: 'cascade-hops',
      amount: 2,
      saleKind: 'PACKAGE',
      stockAmount: 100,
    },
  ],
  subtotalMinor: 1398,
};
void safeCart;

const safeCheckoutReadiness: components['schemas']['CheckoutReadinessDto'] = {
  checkedAt: '2026-08-27T12:00:00.000Z',
  lines: [
    {
      outcome: 'available',
      productSlug: 'cascade-hops',
      requestedAmount: 2,
    },
  ],
  status: 'ready',
};
void safeCheckoutReadiness;

const otherSafeCheckoutReadinessStates: components['schemas']['CheckoutReadinessDto'][] =
  [
    {
      checkedAt: '2026-08-27T12:01:00.000Z',
      lines: [],
      status: 'empty',
    },
    {
      checkedAt: '2026-08-27T12:02:00.000Z',
      lines: [
        {
          outcome: 'available',
          productSlug: 'cascade-hops',
          requestedAmount: 2,
        },
        {
          outcome: 'insufficient_stock',
          productSlug: 'citra-hops',
          requestedAmount: 100_000,
        },
        {
          outcome: 'product_unavailable',
          productSlug: 'mosaic-hops',
          requestedAmount: 100_000,
        },
        {
          outcome: 'invalid_amount',
          productSlug: 'caramel-malt-60l',
          requestedAmount: 150_000,
        },
        {
          outcome: 'price_unavailable',
          productSlug: 'house-lager',
          requestedAmount: 1,
        },
      ],
      status: 'unavailable',
    },
  ];
void otherSafeCheckoutReadinessStates;

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
  amountUnit: 'MILLIGRAM',
  availability: 'in-stock',
  category: { name: 'Hops', slug: 'hops' },
  currency: 'USD',
  description: 'Three-paragraph detail copy',
  id: '20000000-0000-4000-8000-000000000001',
  imagePath: '/assets/products/citra-hops.webp',
  kitYieldVolumeMl: null,
  maximumOrderAmount: null,
  minimumOrderAmount: 100_000,
  name: 'Citra Hops',
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  priceMinor: 599,
  priceQualifier: 'per 100g',
  saleKind: 'WEIGHT',
  slug: 'citra-hops',
  stockAmount: 100_000_000,
  specifications: [
    { label: 'Origin', value: 'USA' },
    { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
  ],
  teaser: 'Ideal for IPAs and Pale Ales',
};
void detail;

const normalized: CatalogCompatibilityResult = normalizeCatalogResponse([]);
void normalized;
