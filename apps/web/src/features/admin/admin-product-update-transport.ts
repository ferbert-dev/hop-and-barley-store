'use client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';
import type { AdminProductUpdatePayload } from './admin-product-create-validation';

const DEFAULT_API_URL = 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 10_000;
const CSRF_TOKEN = /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u;

export class AdminProductUpdateTransportError extends Error {
  constructor(readonly status: number) {
    super(`Admin product update failed with ${status}`);
  }
}

export async function updateAdminProductFromBrowser(
  id: string,
  payload: AdminProductUpdatePayload,
  options: Readonly<{
    apiHostAliases?: string;
    apiUrl?: string;
    fetcher?: typeof fetch;
    origin?: string;
  }> = {},
): Promise<void> {
  const origin = options.origin ?? window.location.origin;
  const apiUrl = resolveBrowserApiUrl(
    options.apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
    origin,
    options.apiHostAliases ?? process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
  );
  const fetcher = options.fetcher ?? fetch;
  const csrfResponse = await fetcher(`${apiUrl}/api/v1/auth/csrf`, {
    cache: 'no-store',
    credentials: 'include',
    signal: AbortSignal.timeout(1_500),
  });
  assertPrivate(csrfResponse);
  const csrf = await csrfResponse.json().catch(() => undefined);
  if (
    !csrfResponse.ok ||
    typeof csrf?.csrfToken !== 'string' ||
    !CSRF_TOKEN.test(csrf.csrfToken)
  ) {
    throw new AdminProductUpdateTransportError(csrfResponse.status);
  }

  const body = new FormData();
  body.set('name', payload.name);
  body.set('description', payload.description);
  if (payload.teaser) body.set('teaser', payload.teaser);
  body.set('price', payload.price);
  body.set('categoryId', payload.categoryId);
  body.set('saleKind', payload.saleKind);
  body.set('stockAmount', String(payload.stockAmount));
  body.set('isActive', String(payload.isActive));
  body.set('expectedUpdatedAt', payload.expectedUpdatedAt);
  if (payload.kitYieldVolumeMl !== undefined) {
    body.set('kitYieldVolumeMl', String(payload.kitYieldVolumeMl));
  }
  if (payload.activeFrom) body.set('activeFrom', payload.activeFrom);
  if (payload.activeUntil) body.set('activeUntil', payload.activeUntil);
  if (payload.packageNetWeightMg !== undefined) {
    body.set('packageNetWeightMg', String(payload.packageNetWeightMg));
  }
  if (payload.image) body.set('image', payload.image);

  const response = await fetcher(`${apiUrl}/api/v1/admin/products/${id}`, {
    body,
    cache: 'no-store',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf.csrfToken },
    method: 'PATCH',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assertPrivate(response);
  if (!response.ok) throw new AdminProductUpdateTransportError(response.status);
}

function assertPrivate(response: Response): void {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!cacheControl.includes('private') || !cacheControl.includes('no-store')) {
    throw new AdminProductUpdateTransportError(response.status);
  }
}
