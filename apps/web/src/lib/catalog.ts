import {
  createApiClient,
  normalizeCatalogResponse,
  type CatalogCompatibilityResult,
} from '@hop-and-barley/api-client';

import {
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
} from '../features/catalog/catalog-query';

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
  query: CatalogQuery = DEFAULT_CATALOG_QUERY,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<CatalogLoadResult> {
  try {
    const client = createApiClient(resolveApiOrigin(rawApiUrl), {
      requestInitExt: { next: { revalidate: 60 } } satisfies RequestInit,
    });
    const requestCatalog = async (requestQuery: CatalogQuery) => {
      const { data, error, response } = await client.GET('/api/v1/products', {
        params: { query: requestQuery },
        signal: AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok || error !== undefined || data === undefined) {
        throw new Error(`Catalog request failed with ${response.status}`);
      }

      return normalizeCatalogResponse(data);
    };

    try {
      return { catalog: await requestCatalog(query), connected: true };
    } catch (primaryError) {
      if (!query.category || query.category.length <= 1) throw primaryError;

      const fallback = await requestCatalog({
        ...query,
        category: query.category.slice(0, 1),
      });
      if (fallback.kind !== 'paged-predecessor') throw primaryError;

      return { catalog: fallback, connected: true };
    }
  } catch {
    return { catalog: null, connected: false };
  }
}
