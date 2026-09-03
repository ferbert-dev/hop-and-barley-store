import 'server-only';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { type AdminProductsQuery } from './admin-products-query';
import { resolveTrustedAdminApiOrigin } from './admin-capability';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
export const ADMIN_PRODUCTS_REQUEST_TIMEOUT_MS = 1_500;

export type AdminProductsResponse =
  components['schemas']['AdminProductListResponseDto'];

export type AdminProductsLoadResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'loaded'; products: AdminProductsResponse }>
  | Readonly<{ kind: 'unavailable' }>;

export async function loadAdminProducts(
  sessionCookie: string | null,
  query: AdminProductsQuery,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<AdminProductsLoadResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const client = createApiClient(resolveTrustedAdminApiOrigin(rawApiUrl), {
      cache: 'no-store',
      fetch: async (request) => {
        const headers = new Headers(request.headers);
        headers.set('Cookie', sessionCookie);
        return globalThis.fetch(
          new Request(request, { cache: 'no-store', headers }),
        );
      },
    });
    const { data, error, response } = await client.GET(
      '/api/v1/admin/products',
      {
        params: { query },
        signal: AbortSignal.timeout(ADMIN_PRODUCTS_REQUEST_TIMEOUT_MS),
      },
    );
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'anonymous' };
    if (response.status === 403) return { kind: 'denied' };
    if (!response.ok || error !== undefined || !isAdminProductsResponse(data)) {
      return { kind: 'unavailable' };
    }
    return { kind: 'loaded', products: data };
  } catch {
    return { kind: 'unavailable' };
  }
}

function assertPrivateResponse(response: Response): void {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new Error('Private admin products response is cacheable');
  }
}

function isAdminProductsResponse(
  value: unknown,
): value is AdminProductsResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !isRecord(value.meta)
  ) {
    return false;
  }
  return value.items.every(isAdminProduct) && isMeta(value.meta);
}

function isAdminProduct(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.category)) return false;
  return (
    isShortString(value.id) &&
    isShortString(value.slug) &&
    isShortString(value.name) &&
    isShortString(value.description) &&
    isShortString(value.imagePath) &&
    isNonNegativeInteger(value.priceMinor) &&
    value.currency === 'USD' &&
    isShortString(value.priceQualifier) &&
    isShortString(value.category.slug) &&
    isShortString(value.category.name) &&
    isSaleKind(value.saleKind) &&
    isAmountUnit(value.amountUnit) &&
    isNonNegativeInteger(value.stockAmount) &&
    typeof value.isActive === 'boolean' &&
    isNullableDateTime(value.activeFrom) &&
    isNullableDateTime(value.activeUntil) &&
    isLifecycleStatus(value.lifecycleStatus) &&
    isDateTime(value.createdAt) &&
    isDateTime(value.updatedAt)
  );
}

function isMeta(value: Record<string, unknown>): boolean {
  return (
    isPositiveInteger(value.page) &&
    isPositiveInteger(value.limit) &&
    isNonNegativeInteger(value.totalItems) &&
    isNonNegativeInteger(value.totalPages) &&
    typeof value.hasNextPage === 'boolean' &&
    typeof value.hasPreviousPage === 'boolean' &&
    isSort(value.sort) &&
    value.currency === 'USD' &&
    isFilters(value.filters) &&
    isRecord(value.facets) &&
    Array.isArray(value.facets.categories) &&
    value.facets.categories.every(isCategory)
  );
}

function isFilters(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNullableShortString(value.search) &&
    isNullableShortString(value.category) &&
    isNullableShortString(value.lifecycle) &&
    isNullableNonNegativeInteger(value.minPriceMinor) &&
    isNullableNonNegativeInteger(value.maxPriceMinor)
  );
}

function isCategory(value: unknown): boolean {
  return (
    isRecord(value) && isShortString(value.slug) && isShortString(value.name)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4_000;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && Number(value) > 0;
}

function isNullableNonNegativeInteger(value: unknown): boolean {
  return value === null || isNonNegativeInteger(value);
}

function isNullableShortString(value: unknown): boolean {
  return value === null || isShortString(value);
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNullableDateTime(value: unknown): boolean {
  return value === null || isDateTime(value);
}

function isSaleKind(value: unknown): boolean {
  return value === 'WEIGHT' || value === 'PACKAGE' || value === 'KIT';
}

function isAmountUnit(value: unknown): boolean {
  return value === 'MILLIGRAM' || value === 'EACH';
}

function isLifecycleStatus(value: unknown): boolean {
  return (
    value === 'ACTIVE' ||
    value === 'ENDING_SOON' ||
    value === 'DISABLED' ||
    value === 'SCHEDULED' ||
    value === 'EXPIRED'
  );
}

function isSort(value: unknown): boolean {
  return (
    value === 'name-asc' ||
    value === 'name-desc' ||
    value === 'price-asc' ||
    value === 'price-desc'
  );
}
