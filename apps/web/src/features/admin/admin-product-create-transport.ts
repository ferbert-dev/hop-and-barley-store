'use client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';
import type { AdminProductCreatePayload } from './admin-product-create-validation';

const DEFAULT_API_URL = 'http://localhost:3001';
const CREATE_REQUEST_TIMEOUT_MS = 10_000;
const CSRF_REQUEST_TIMEOUT_MS = 1_500;
const CSRF_TOKEN = /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u;
const PRODUCT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PRODUCT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRODUCT_IMAGE_PATH =
  /^\/product-assets\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$/;

export type AdminProductCreated = Readonly<{
  id: string;
  imagePath: string;
  slug: string;
}>;

export class AdminProductCreateTransportError extends Error {
  constructor(readonly status: number) {
    super(`Admin product creation failed with ${status}`);
  }
}

export async function createAdminProductFromBrowser(
  payload: AdminProductCreatePayload,
  options: Readonly<{
    apiHostAliases?: string;
    apiUrl?: string;
    fetcher?: typeof fetch;
    origin?: string;
  }> = {},
): Promise<AdminProductCreated> {
  const origin = options.origin ?? window.location.origin;
  const apiUrl = resolveBrowserApiUrl(
    options.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
    origin,
    options.apiHostAliases ?? process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
  );
  const fetcher = options.fetcher ?? fetch;
  const csrf = await getCsrf(fetcher, apiUrl);
  const response = await fetcher(`${apiUrl}/api/v1/admin/products`, {
    body: toMultipartBody(payload),
    cache: 'no-store',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf },
    method: 'POST',
    signal: AbortSignal.timeout(CREATE_REQUEST_TIMEOUT_MS),
  });
  assertPrivateResponse(response);
  const data = await response.json().catch(() => undefined);
  if (!response.ok || !isCreatedProduct(data)) {
    throw new AdminProductCreateTransportError(response.status);
  }
  return data;
}

async function getCsrf(fetcher: typeof fetch, apiUrl: string): Promise<string> {
  const response = await fetcher(`${apiUrl}/api/v1/auth/csrf`, {
    cache: 'no-store',
    credentials: 'include',
    signal: AbortSignal.timeout(CSRF_REQUEST_TIMEOUT_MS),
  });
  assertPrivateResponse(response);
  const data = await response.json().catch(() => undefined);
  if (!response.ok || !isCsrfResponse(data)) {
    throw new AdminProductCreateTransportError(response.status);
  }
  return data.csrfToken;
}

function toMultipartBody(payload: AdminProductCreatePayload): FormData {
  const body = new FormData();
  body.set('name', payload.name);
  body.set('description', payload.description);
  if (payload.teaser) body.set('teaser', payload.teaser);
  body.set('price', payload.price);
  body.set('categoryId', payload.categoryId);
  body.set('saleKind', payload.saleKind);
  body.set('stockAmount', String(payload.stockAmount));
  body.set('isActive', String(payload.isActive));
  if (payload.kitYieldVolumeMl !== undefined) {
    body.set('kitYieldVolumeMl', String(payload.kitYieldVolumeMl));
  }
  if (payload.activeFrom) body.set('activeFrom', payload.activeFrom);
  if (payload.activeUntil) body.set('activeUntil', payload.activeUntil);
  if (payload.packageNetWeightMg !== undefined) {
    body.set('packageNetWeightMg', String(payload.packageNetWeightMg));
  }
  body.set('image', payload.image);
  return body;
}

function assertPrivateResponse(response: Response) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!cacheControl.includes('private') || !cacheControl.includes('no-store')) {
    throw new AdminProductCreateTransportError(response.status);
  }
}

function isCsrfResponse(value: unknown): value is { csrfToken: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { csrfToken?: unknown }).csrfToken === 'string' &&
    CSRF_TOKEN.test((value as { csrfToken: string }).csrfToken)
  );
}

function isCreatedProduct(value: unknown): value is AdminProductCreated {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === 'string' &&
    PRODUCT_ID.test(product.id) &&
    typeof product.slug === 'string' &&
    PRODUCT_SLUG.test(product.slug) &&
    typeof product.imagePath === 'string' &&
    PRODUCT_IMAGE_PATH.test(product.imagePath)
  );
}
