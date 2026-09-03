import 'server-only';

import type { components } from '@hop-and-barley/api-client';

import { resolveTrustedAdminApiOrigin } from './admin-capability';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';

export type AdminEditableProduct =
  components['schemas']['AdminCreatedProductDto'];
export type AdminProductLoadResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'loaded'; product: AdminEditableProduct }>
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'unavailable' }>;

export async function loadAdminProduct(
  sessionCookie: string | null,
  id: string,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<AdminProductLoadResult> {
  if (!sessionCookie) return { kind: 'anonymous' };
  try {
    const origin = resolveTrustedAdminApiOrigin(rawApiUrl);
    const response = await fetch(`${origin}/api/v1/admin/products/${id}`, {
      cache: 'no-store',
      headers: { Cookie: sessionCookie },
      signal: AbortSignal.timeout(1_500),
    });
    assertPrivate(response);
    if (response.status === 401) return { kind: 'anonymous' };
    if (response.status === 403) return { kind: 'denied' };
    if (response.status === 404) return { kind: 'not-found' };
    const product = await response.json().catch(() => undefined);
    return response.ok && isProduct(product)
      ? { kind: 'loaded', product }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

function assertPrivate(response: Response): void {
  const value = response.headers.get('cache-control') ?? '';
  if (!value.includes('private') || !value.includes('no-store')) {
    throw new Error('Private admin product response is cacheable');
  }
}

function isProduct(value: unknown): value is AdminEditableProduct {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === 'string' &&
    typeof product.name === 'string' &&
    typeof product.teaser === 'string' &&
    typeof product.description === 'string' &&
    typeof product.imagePath === 'string' &&
    typeof product.updatedAt === 'string' &&
    typeof product.priceMinor === 'number' &&
    typeof product.stockAmount === 'number' &&
    typeof product.isActive === 'boolean' &&
    (product.saleKind === 'WEIGHT' ||
      product.saleKind === 'PACKAGE' ||
      product.saleKind === 'KIT') &&
    typeof product.category === 'object' &&
    product.category !== null
  );
}
