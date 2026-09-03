import 'server-only';

import { resolveTrustedAdminApiOrigin } from './admin-capability';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const ADMIN_CREATE_OPTIONS_TIMEOUT_MS = 1_500;
const CATEGORY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EXPECTED_CATEGORIES = [
  ['Hops', 'hops'],
  ['Malt', 'malts'],
  ['Yeast', 'yeast'],
  ['Adjuncts', 'adjuncts'],
  ['Kits', 'kits'],
] as const;

export type AdminProductCreateOptions = Readonly<{
  categories: readonly Readonly<{ id: string; name: string; slug: string }>[];
  saleKinds: readonly ['WEIGHT', 'PACKAGE', 'KIT'];
}>;

export type AdminProductCreateOptionsResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'loaded'; options: AdminProductCreateOptions }>
  | Readonly<{ kind: 'unavailable' }>;

export async function loadAdminProductCreateOptions(
  sessionCookie: string | null,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<AdminProductCreateOptionsResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const origin = resolveTrustedAdminApiOrigin(rawApiUrl);
    const response = await fetch(
      `${origin}/api/v1/admin/products/create-options`,
      {
        cache: 'no-store',
        headers: { Cookie: sessionCookie },
        signal: AbortSignal.timeout(ADMIN_CREATE_OPTIONS_TIMEOUT_MS),
      },
    );
    assertPrivateResponse(response);
    if (response.status === 401) return { kind: 'anonymous' };
    if (response.status === 403) return { kind: 'denied' };
    const data = await response.json().catch(() => undefined);
    return response.ok && isOptions(data)
      ? { kind: 'loaded', options: data }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

function assertPrivateResponse(response: Response) {
  const cacheControl = response.headers.get('cache-control') ?? '';
  if (!cacheControl.includes('private') || !cacheControl.includes('no-store')) {
    throw new Error('Private admin create-options response is cacheable');
  }
}

function isOptions(value: unknown): value is AdminProductCreateOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const options = value as Record<string, unknown>;
  if (!Array.isArray(options.categories) || !Array.isArray(options.saleKinds)) {
    return false;
  }
  return (
    options.categories.length === EXPECTED_CATEGORIES.length &&
    options.categories.every((category, index) => {
      const expected = EXPECTED_CATEGORIES[index];
      return (
        typeof category === 'object' &&
        category !== null &&
        !Array.isArray(category) &&
        typeof (category as { id?: unknown }).id === 'string' &&
        CATEGORY_ID.test((category as { id: string }).id) &&
        (category as { name?: unknown }).name === expected?.[0] &&
        (category as { slug?: unknown }).slug === expected?.[1]
      );
    }) &&
    options.saleKinds.length === 3 &&
    options.saleKinds[0] === 'WEIGHT' &&
    options.saleKinds[1] === 'PACKAGE' &&
    options.saleKinds[2] === 'KIT'
  );
}
