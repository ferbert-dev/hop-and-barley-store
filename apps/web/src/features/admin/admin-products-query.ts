import type { paths } from '@hop-and-barley/api-client';

export type AdminProductsSearchParams = Record<
  string,
  string | readonly string[] | undefined
>;

type GeneratedAdminQuery = NonNullable<
  paths['/api/v1/admin/products']['get']['parameters']['query']
>;

export type AdminProductsQuery = Omit<
  GeneratedAdminQuery,
  'limit' | 'page' | 'sort'
> &
  Required<Pick<GeneratedAdminQuery, 'limit' | 'page' | 'sort'>>;

export type AdminProductsQueryParseResult =
  | {
      canonicalHref: string;
      isCanonical: boolean;
      kind: 'valid';
      query: AdminProductsQuery;
    }
  | { kind: 'invalid'; message: string };

const DEFAULT_QUERY = Object.freeze({
  limit: 12,
  page: 1,
  sort: 'name-asc',
}) satisfies AdminProductsQuery;
const ALLOWED_KEYS = new Set([
  'category',
  'limit',
  'lifecycle',
  'maxPriceMinor',
  'minPriceMinor',
  'page',
  'search',
  'sort',
]);
const SORTS = new Set<AdminProductsQuery['sort']>([
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
]);
const LIFECYCLES = new Set<NonNullable<AdminProductsQuery['lifecycle']>>([
  'ACTIVE',
  'ENDING_SOON',
  'DISABLED',
  'SCHEDULED',
  'EXPIRED',
]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INTEGER = /^(?:0|[1-9][0-9]*)$/;
const SEARCH_FORBIDDEN = /[\p{C}\\%_]/u;
const WHITESPACE = /\p{White_Space}+/gu;
const MAX_INT32 = 2_147_483_647;

export function parseAdminProductsSearchParams(
  raw: AdminProductsSearchParams,
): AdminProductsQueryParseResult {
  if (
    Object.keys(raw).some((key) => !ALLOWED_KEYS.has(key)) ||
    Object.values(raw).some(Array.isArray)
  ) {
    return invalid('The admin products URL contains an unsupported parameter.');
  }
  const scalar = raw as Readonly<Record<string, string | undefined>>;
  const search = parseSearch(scalar.search);
  const category = parseCategory(scalar.category);
  const lifecycle = parseLifecycle(scalar.lifecycle);
  const minPriceMinor = parseInteger(scalar.minPriceMinor, 0, MAX_INT32);
  const maxPriceMinor = parseInteger(scalar.maxPriceMinor, 0, MAX_INT32);
  const sort = parseSort(scalar.sort);
  const page = parseInteger(scalar.page, 1, 200);
  const limit = parseInteger(scalar.limit, 1, 48);

  if (
    search.kind === 'invalid' ||
    category.kind === 'invalid' ||
    lifecycle.kind === 'invalid' ||
    minPriceMinor.kind === 'invalid' ||
    maxPriceMinor.kind === 'invalid' ||
    sort.kind === 'invalid' ||
    page.kind === 'invalid' ||
    limit.kind === 'invalid'
  ) {
    return invalid('The admin products URL contains an invalid value.');
  }
  if (
    typeof minPriceMinor.value === 'number' &&
    typeof maxPriceMinor.value === 'number' &&
    minPriceMinor.value > maxPriceMinor.value
  ) {
    return invalid('The minimum price cannot be greater than the maximum.');
  }

  const query: AdminProductsQuery = {
    ...(search.value === undefined ? {} : { search: search.value as string }),
    ...(category.value === undefined
      ? {}
      : { category: category.value as string }),
    ...(lifecycle.value === undefined
      ? {}
      : {
          lifecycle: lifecycle.value as NonNullable<
            AdminProductsQuery['lifecycle']
          >,
        }),
    ...(minPriceMinor.value === undefined
      ? {}
      : { minPriceMinor: minPriceMinor.value as number }),
    ...(maxPriceMinor.value === undefined
      ? {}
      : { maxPriceMinor: maxPriceMinor.value as number }),
    limit: (limit.value as number | undefined) ?? DEFAULT_QUERY.limit,
    page: (page.value as number | undefined) ?? DEFAULT_QUERY.page,
    sort:
      (sort.value as AdminProductsQuery['sort'] | undefined) ??
      DEFAULT_QUERY.sort,
  };
  const canonicalHref = buildAdminProductsHref(query);
  return {
    canonicalHref,
    isCanonical: serializeRaw(raw) === canonicalHref,
    kind: 'valid',
    query,
  };
}

export function buildAdminProductsHref(
  current: AdminProductsQuery,
  overrides: Partial<AdminProductsQuery> = {},
  resetPage = false,
): string {
  const query = {
    ...current,
    ...overrides,
    ...(resetPage ? { page: DEFAULT_QUERY.page } : {}),
  };
  const parameters = new URLSearchParams();
  if (query.search) parameters.set('search', query.search);
  if (query.category) parameters.set('category', query.category);
  if (query.lifecycle) parameters.set('lifecycle', query.lifecycle);
  if (query.minPriceMinor !== undefined)
    parameters.set('minPriceMinor', String(query.minPriceMinor));
  if (query.maxPriceMinor !== undefined)
    parameters.set('maxPriceMinor', String(query.maxPriceMinor));
  if (query.sort !== DEFAULT_QUERY.sort) parameters.set('sort', query.sort);
  if (query.page !== DEFAULT_QUERY.page)
    parameters.set('page', String(query.page));
  if (query.limit !== DEFAULT_QUERY.limit)
    parameters.set('limit', String(query.limit));
  const serialized = parameters.toString();
  return serialized ? `/admin/products?${serialized}` : '/admin/products';
}

type Parsed = { kind: 'valid'; value?: string | number } | { kind: 'invalid' };

function parseSearch(value: string | undefined): Parsed {
  if (value === undefined) return valid();
  const normalized = value.normalize('NFC');
  if (SEARCH_FORBIDDEN.test(normalized)) return invalidValue();
  const collapsed = normalized.trim().replace(WHITESPACE, ' ');
  if (!collapsed) return valid();
  const tokens = collapsed.split(' ');
  return Array.from(collapsed).length >= 2 &&
    Array.from(collapsed).length <= 80 &&
    tokens.length <= 8 &&
    tokens.every((token) => Array.from(token).length <= 32)
    ? valid(collapsed)
    : invalidValue();
}

function parseCategory(value: string | undefined): Parsed {
  if (value === undefined || value === '') return valid();
  return value.length <= 64 && SLUG.test(value) ? valid(value) : invalidValue();
}

function parseLifecycle(value: string | undefined): Parsed {
  if (value === undefined || value === '') return valid();
  return LIFECYCLES.has(value as NonNullable<AdminProductsQuery['lifecycle']>)
    ? valid(value)
    : invalidValue();
}

function parseInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
): Parsed {
  if (value === undefined || value === '') return valid();
  if (!INTEGER.test(value)) return invalidValue();
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? valid(parsed)
    : invalidValue();
}

function parseSort(value: string | undefined): Parsed {
  if (value === undefined) return valid();
  return SORTS.has(value as AdminProductsQuery['sort'])
    ? valid(value)
    : invalidValue();
}

function serializeRaw(raw: AdminProductsSearchParams): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') parameters.append(key, value);
  }
  const serialized = parameters.toString();
  return serialized ? `/admin/products?${serialized}` : '/admin/products';
}

function valid(value?: string | number): Parsed {
  return { kind: 'valid', value };
}

function invalidValue(): Parsed {
  return { kind: 'invalid' };
}

function invalid(message: string): AdminProductsQueryParseResult {
  return { kind: 'invalid', message };
}
