import {
  buildCatalogHref,
  parseCatalogSearchParams,
  type CatalogQuery,
  type CatalogQueryParseResult,
  type CatalogSearchParams,
} from '../catalog/catalog-query';

export type AdminProductsQuery = CatalogQuery;
export type AdminProductsSearchParams = CatalogSearchParams;

export type AdminProductsQueryParseResult =
  | {
      canonicalHref: string;
      isCanonical: boolean;
      kind: 'valid';
      query: AdminProductsQuery;
    }
  | Extract<CatalogQueryParseResult, { kind: 'invalid' }>;

/**
 * Admin listing URL state intentionally shares the accepted catalog grammar.
 * Its canonical location differs, but the API query keys and validation stay
 * byte-for-byte compatible with the existing catalogue surface.
 */
export function parseAdminProductsSearchParams(
  raw: AdminProductsSearchParams,
): AdminProductsQueryParseResult {
  const parsed = parseCatalogSearchParams(raw);
  if (parsed.kind === 'invalid') return parsed;

  const canonicalHref = buildAdminProductsHref(parsed.query);
  return {
    canonicalHref,
    isCanonical: serializeAdminProductsHref(raw) === canonicalHref,
    kind: 'valid',
    query: parsed.query,
  };
}

export function buildAdminProductsHref(
  current: AdminProductsQuery,
  overrides: Partial<AdminProductsQuery> = {},
  resetPage = false,
): string {
  const catalogHref = buildCatalogHref(current, overrides, resetPage);
  return catalogHref === '/'
    ? '/admin/products'
    : `/admin/products${catalogHref.slice(1)}`;
}

function serializeAdminProductsHref(raw: AdminProductsSearchParams): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') parameters.append(key, value);
  }
  const serialized = parameters.toString();
  return serialized.length === 0
    ? '/admin/products'
    : `/admin/products?${serialized}`;
}
