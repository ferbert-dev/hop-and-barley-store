'use client';

import { createApiClient, type components } from '@hop-and-barley/api-client';
import { resolveBrowserApiUrl } from '../../lib/browser-api-url';

const DEFAULT_API_URL = 'http://localhost:3001';
const CART_REQUEST_TIMEOUT_MS = 1_500;

export type Cart = components['schemas']['CartDto'];

export class CartTransportError extends Error {
  constructor(readonly status: number) {
    super(`Cart request failed with ${status}`);
  }
}

export type CartTransport = Readonly<{
  add(productSlug: string, quantity: number): Promise<Cart>;
  clear(): Promise<Cart>;
  load(): Promise<Cart>;
  recheck(): Promise<Cart>;
  remove(productSlug: string): Promise<Cart>;
  update(productSlug: string, quantity: number): Promise<Cart>;
}>;

export function createBrowserCartTransport(
  requestOrigin: () => string = () => window.location.origin,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  apiHostAliases = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
): CartTransport {
  const requestContext = () => {
    const origin = requestOrigin();
    const client = createApiClient(
      resolveBrowserApiUrl(apiUrl, origin, apiHostAliases),
      {
        cache: 'no-store',
        credentials: 'include',
      },
    );
    return { client, origin };
  };

  const withCsrf = async (client: ReturnType<typeof createApiClient>) => {
    const { data, error, response } = await client.GET('/api/v1/cart/csrf', {
      signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);
    if (response.status === 401) return null;
    if (!response.ok || error !== undefined || !isCsrfToken(data)) {
      throw new CartTransportError(response.status);
    }
    return data.csrfToken;
  };

  const bootstrapHeaders = (origin: string) => ({ Origin: origin });
  const mutationHeaders = (origin: string, csrfToken: string) => ({
    Origin: origin,
    'X-CSRF-Token': csrfToken,
  });

  return {
    async add(productSlug, quantity) {
      const { client, origin } = requestContext();
      const csrfToken = await withCsrf(client);
      const { data, error, response } = await client.POST(
        '/api/v1/cart/items',
        {
          body: { productSlug, quantity },
          params: {
            header: csrfToken
              ? mutationHeaders(origin, csrfToken)
              : bootstrapHeaders(origin),
          },
          signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
        },
      );
      return cartFromResponse(data, error, response);
    },
    async clear() {
      const { client, origin } = requestContext();
      const csrfToken = await requireCsrf(() => withCsrf(client));
      const { data, error, response } = await client.DELETE(
        '/api/v1/cart/items',
        {
          params: { header: mutationHeaders(origin, csrfToken) },
          signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
        },
      );
      return cartFromResponse(data, error, response);
    },
    async load() {
      const { client } = requestContext();
      const { data, error, response } = await client.GET('/api/v1/cart', {
        signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
      });
      return cartFromResponse(data, error, response);
    },
    async recheck() {
      const { client, origin } = requestContext();
      const csrfToken = await requireCsrf(() => withCsrf(client));
      const { data, error, response } = await client.POST(
        '/api/v1/cart/recheck',
        {
          params: { header: mutationHeaders(origin, csrfToken) },
          signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
        },
      );
      return cartFromResponse(data, error, response);
    },
    async remove(productSlug) {
      const { client, origin } = requestContext();
      const csrfToken = await requireCsrf(() => withCsrf(client));
      const { data, error, response } = await client.DELETE(
        '/api/v1/cart/items/{productSlug}',
        {
          params: {
            header: mutationHeaders(origin, csrfToken),
            path: { productSlug },
          },
          signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
        },
      );
      return cartFromResponse(data, error, response);
    },
    async update(productSlug, quantity) {
      const { client, origin } = requestContext();
      const csrfToken = await requireCsrf(() => withCsrf(client));
      const { data, error, response } = await client.PATCH(
        '/api/v1/cart/items/{productSlug}',
        {
          body: { quantity },
          params: {
            header: mutationHeaders(origin, csrfToken),
            path: { productSlug },
          },
          signal: AbortSignal.timeout(CART_REQUEST_TIMEOUT_MS),
        },
      );
      return cartFromResponse(data, error, response);
    },
  };
}

async function requireCsrf(loadCsrf: () => Promise<string | null>) {
  const csrfToken = await loadCsrf();
  if (!csrfToken) throw new CartTransportError(401);
  return csrfToken;
}

function cartFromResponse(
  data: unknown,
  error: unknown,
  response: Response,
): Cart {
  assertPrivateResponse(response);
  if (!response.ok || error !== undefined || !isCart(data)) {
    throw new CartTransportError(response.status);
  }
  return data;
}

function assertPrivateResponse(response: Response) {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new CartTransportError(response.status);
  }
}

function isCart(value: unknown): value is Cart {
  if (
    !isRecord(value) ||
    value.currency !== 'USD' ||
    !Array.isArray(value.items) ||
    !isDateTime(value.serverNow) ||
    !isNullableString(value.adjustmentMessage)
  ) {
    return false;
  }
  return (
    isNonNegativeSafeInteger(value.distinctItemCount) &&
    value.distinctItemCount === value.items.length &&
    isNonNegativeSafeInteger(value.totalQuantity) &&
    isNonNegativeSafeInteger(value.subtotalMinor) &&
    typeof value.checkoutEligible === 'boolean' &&
    value.items.every(isCartItem)
  );
}

function isCartItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.productId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      value.productId,
    ) &&
    typeof value.productSlug === 'string' &&
    value.productSlug.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.imagePath === 'string' &&
    value.imagePath.startsWith('/assets/products/') &&
    typeof value.priceQualifier === 'string' &&
    isPositiveSafeInteger(value.quantity) &&
    value.quantity <= 99 &&
    isNullableNonNegativeSafeInteger(value.currentUnitPriceMinor) &&
    isNullableNonNegativeSafeInteger(value.lineTotalMinor) &&
    (value.availability === 'available' ||
      value.availability === 'unavailable') &&
    isReservation(value.reservationStatus, value.reservationExpiresAt)
  );
}

function isReservation(status: unknown, expiresAt: unknown) {
  if (status === 'unreserved') return expiresAt === null;
  return (status === 'active' || status === 'expired') && isDateTime(expiresAt);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNullableNonNegativeSafeInteger(
  value: unknown,
): value is number | null {
  return value === null || isNonNegativeSafeInteger(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      value,
    );
  if (!match || Number.isNaN(Date.parse(value))) return false;

  const [year, month, day] = match.slice(1, 4).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function isCsrfToken(
  value: unknown,
): value is components['schemas']['CartCsrfResponseDto'] {
  return (
    isRecord(value) &&
    typeof value.csrfToken === 'string' &&
    /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
