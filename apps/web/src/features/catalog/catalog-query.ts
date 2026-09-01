import type { paths } from '@hop-and-barley/api-client';

export type CatalogSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

type GeneratedCatalogQuery = NonNullable<
  paths['/api/v1/products']['get']['parameters']['query']
>;

export type CatalogQuery = Omit<
  GeneratedCatalogQuery,
  'limit' | 'page' | 'sort'
> &
  Required<Pick<GeneratedCatalogQuery, 'limit' | 'page' | 'sort'>>;

export type CatalogQueryParseResult =
  | {
      canonicalHref: string;
      isCanonical: boolean;
      kind: 'valid';
      query: CatalogQuery;
    }
  | {
      kind: 'invalid';
      message: string;
    };

export const DEFAULT_CATALOG_QUERY = Object.freeze({
  limit: 12,
  page: 1,
  sort: 'name-asc',
}) satisfies CatalogQuery;

const ALLOWED_KEYS = new Set([
  'category',
  'limit',
  'maxPriceMinor',
  'minPriceMinor',
  'page',
  'search',
  'sort',
]);
const SORT_VALUES = new Set<CatalogQuery['sort']>([
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
]);
const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UNSIGNED_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const SEARCH_FORBIDDEN = /[\p{C}\\%_]/u;
const SEARCH_WHITESPACE = /\p{White_Space}+/gu;
const MAX_INT32 = 2_147_483_647;

export function parseCatalogSearchParams(
  raw: CatalogSearchParams,
): CatalogQueryParseResult {
  if (Object.keys(raw).some((key) => !ALLOWED_KEYS.has(key))) {
    return invalid('The catalog URL contains an unsupported parameter.');
  }
  if (
    Object.entries(raw).some(
      ([key, value]) => key !== 'category' && Array.isArray(value),
    )
  ) {
    return invalid('Only Product Type may appear more than once.');
  }

  const scalar = raw as Readonly<
    Record<string, string | readonly string[] | undefined>
  >;

  const search = parseSearch(asScalar(scalar.search));
  const category = parseCategories(scalar.category);
  const minPriceMinor = parseInteger(
    asScalar(scalar.minPriceMinor),
    0,
    MAX_INT32,
  );
  const maxPriceMinor = parseInteger(
    asScalar(scalar.maxPriceMinor),
    0,
    MAX_INT32,
  );
  const sort = parseSort(asScalar(scalar.sort));
  const page = parseInteger(asScalar(scalar.page), 1, 200);
  const limit = parseInteger(asScalar(scalar.limit), 1, 48);

  if (
    search.kind === 'invalid' ||
    category.kind === 'invalid' ||
    minPriceMinor.kind === 'invalid' ||
    maxPriceMinor.kind === 'invalid' ||
    sort.kind === 'invalid' ||
    page.kind === 'invalid' ||
    limit.kind === 'invalid'
  ) {
    return invalid('The catalog URL contains an invalid value.');
  }
  if (
    minPriceMinor.value !== undefined &&
    maxPriceMinor.value !== undefined &&
    minPriceMinor.value > maxPriceMinor.value
  ) {
    return invalid('The minimum price cannot be greater than the maximum.');
  }

  const query: CatalogQuery = {
    ...(search.value === undefined ? {} : { search: search.value }),
    ...(category.value === undefined ? {} : { category: category.value }),
    ...(minPriceMinor.value === undefined
      ? {}
      : { minPriceMinor: minPriceMinor.value }),
    ...(maxPriceMinor.value === undefined
      ? {}
      : { maxPriceMinor: maxPriceMinor.value }),
    sort: sort.value ?? DEFAULT_CATALOG_QUERY.sort,
    page: page.value ?? DEFAULT_CATALOG_QUERY.page,
    limit: limit.value ?? DEFAULT_CATALOG_QUERY.limit,
  };
  const canonicalHref = buildCatalogHref(query);

  return {
    canonicalHref,
    isCanonical: serializeRawHref(raw) === canonicalHref,
    kind: 'valid',
    query,
  };
}

export function buildCatalogHref(
  current: CatalogQuery,
  overrides: Partial<CatalogQuery> = {},
  resetPage = false,
): string {
  const query = {
    ...current,
    ...overrides,
    ...(resetPage ? { page: DEFAULT_CATALOG_QUERY.page } : {}),
  };
  const parameters = new URLSearchParams();

  if (query.search) parameters.set('search', query.search);
  for (const category of query.category ?? []) {
    parameters.append('category', category);
  }
  if (query.minPriceMinor !== undefined) {
    parameters.set('minPriceMinor', String(query.minPriceMinor));
  }
  if (query.maxPriceMinor !== undefined) {
    parameters.set('maxPriceMinor', String(query.maxPriceMinor));
  }
  if (query.sort !== DEFAULT_CATALOG_QUERY.sort) {
    parameters.set('sort', query.sort);
  }
  if (query.page !== DEFAULT_CATALOG_QUERY.page) {
    parameters.set('page', String(query.page));
  }
  if (query.limit !== DEFAULT_CATALOG_QUERY.limit) {
    parameters.set('limit', String(query.limit));
  }

  const serialized = parameters.toString();
  return serialized.length === 0 ? '/' : `/?${serialized}`;
}

export function buildCatalogTitle(query: CatalogQuery): string {
  if (query.search) return `${query.search} — Hop & Barley products`;
  if (query.category?.length) {
    const category = query.category.map(titleCaseSlug).join(' and ');
    return `${category} — Hop & Barley products`;
  }
  if (query.page > 1) {
    return `Shop brewing ingredients — Page ${String(query.page)} | Hop & Barley`;
  }
  return 'Shop brewing ingredients | Hop & Barley';
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

type Parsed<T> = { kind: 'valid'; value: T | undefined } | { kind: 'invalid' };

function parseSearch(value: string | undefined): Parsed<string> {
  if (value === undefined) return valid();
  const normalized = value.normalize('NFC');
  if (SEARCH_FORBIDDEN.test(normalized)) return invalidValue();
  const collapsed = normalized.trim().replace(SEARCH_WHITESPACE, ' ');
  if (collapsed.length === 0) return valid();

  const characters = Array.from(collapsed);
  const tokens = collapsed.split(' ');
  if (
    characters.length < 2 ||
    characters.length > 80 ||
    tokens.length > 8 ||
    tokens.some((token) => Array.from(token).length > 32)
  ) {
    return invalidValue();
  }
  return valid(collapsed);
}

function parseCategories(
  value: string | readonly string[] | undefined,
): Parsed<string[]> {
  if (value === undefined || value === '') return valid();
  const categories = (Array.isArray(value) ? [...value] : [value]).toSorted();
  if (
    categories.length === 0 ||
    categories.length > 8 ||
    new Set(categories).size !== categories.length ||
    categories.some(
      (category) =>
        category.length === 0 ||
        category.length > 64 ||
        !CATEGORY_SLUG.test(category),
    )
  ) {
    return invalidValue();
  }
  return valid(categories);
}

function parseInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): Parsed<number> {
  if (value === undefined || value === '') return valid();
  if (!CANONICAL_UNSIGNED_INTEGER.test(value)) return invalidValue();
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? valid(parsed)
    : invalidValue();
}

function parseSort(value: string | undefined): Parsed<CatalogQuery['sort']> {
  if (value === undefined) return valid();
  return SORT_VALUES.has(value as CatalogQuery['sort'])
    ? valid(value as CatalogQuery['sort'])
    : invalidValue();
}

function serializeRawHref(raw: CatalogSearchParams): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') parameters.append(key, value);
    if (Array.isArray(value)) {
      for (const item of value) parameters.append(key, item);
    }
  }
  const serialized = parameters.toString();
  return serialized.length === 0 ? '/' : `/?${serialized}`;
}

function asScalar(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function valid<T>(value?: T): Parsed<T> {
  return { kind: 'valid', value };
}

function invalidValue(): { kind: 'invalid' } {
  return { kind: 'invalid' };
}

function invalid(message: string): CatalogQueryParseResult {
  return { kind: 'invalid', message };
}
