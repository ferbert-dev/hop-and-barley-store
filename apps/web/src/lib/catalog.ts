import {
  createApiClient,
  normalizeCatalogResponse,
  type CatalogCompatibilityResult,
} from '@hop-and-barley/api-client';

const DEFAULT_API_URL = 'http://127.0.0.1:3001/api/v1';
export const CATALOG_REQUEST_TIMEOUT_MS = 1_000;

export type CatalogLoadResult =
  | { catalog: CatalogCompatibilityResult; connected: true }
  | { catalog: null; connected: false };

export function resolveApiOrigin(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError('API_INTERNAL_URL must be an absolute HTTP(S) URL');
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/' &&
      url.pathname !== '/api/v1' &&
      url.pathname !== '/api/v1/')
  ) {
    throw new TypeError(
      'API_INTERNAL_URL must be an HTTP(S) origin or end at /api/v1',
    );
  }

  return url.origin;
}

export async function loadCatalog(
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<CatalogLoadResult> {
  try {
    const client = createApiClient(resolveApiOrigin(rawApiUrl), {
      cache: 'no-store',
    });
    const { data, error, response } = await client.GET('/api/v1/products', {
      signal: AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok || error !== undefined || data === undefined) {
      throw new Error(`Catalog request failed with ${response.status}`);
    }

    return { catalog: normalizeCatalogResponse(data), connected: true };
  } catch {
    return { catalog: null, connected: false };
  }
}
