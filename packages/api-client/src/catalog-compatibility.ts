import type { components } from './generated/schema.js';

const MAX_INT32 = 2_147_483_647;
const SORT_VALUES = new Set([
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_PATH = /^\/assets\/products\/[a-z0-9]+(?:-[a-z0-9]+)*[.]webp$/;
const SEARCH_FORBIDDEN = /[\p{C}\\%_]/u;
const LEGACY_PROHIBITED_KEYS = new Set([
  'availability',
  'category',
  'categoryId',
  'imagePath',
  'isActive',
  'priceQualifier',
  'stockQuantity',
  'teaser',
]);

export type PagedCatalogProduct = components['schemas']['ProductDto'];
export type PagedCatalogResponse = components['schemas']['CatalogResponseDto'];
type CatalogMeta = components['schemas']['CatalogMetaDto'];
type ProductCategory = components['schemas']['ProductCategoryDto'];

export type LegacyCatalogProduct = Pick<
  PagedCatalogProduct,
  'currency' | 'description' | 'id' | 'name' | 'priceMinor' | 'slug'
>;

export type CatalogCompatibilityResult =
  | {
      capabilities: { facets: 'unavailable'; pagination: 'unavailable' };
      items: LegacyCatalogProduct[];
      kind: 'legacy';
      meta: null;
    }
  | {
      capabilities: { facets: 'available'; pagination: 'available' };
      items: PagedCatalogProduct[];
      kind: 'paged';
      meta: CatalogMeta;
    };

export class CatalogResponseShapeError extends TypeError {
  constructor() {
    super('Catalog response does not match the legacy or paged list contract');
    this.name = 'CatalogResponseShapeError';
  }
}

export function normalizeCatalogResponse(
  value: unknown,
): CatalogCompatibilityResult {
  if (Array.isArray(value)) {
    return {
      capabilities: { facets: 'unavailable', pagination: 'unavailable' },
      items: value.map(projectLegacyProduct),
      kind: 'legacy',
      meta: null,
    };
  }

  if (!isRecord(value) || !Array.isArray(value.items)) fail();
  const items = value.items.map(projectPagedProduct);
  const meta = projectMeta(value.meta);
  const availableItems = Math.max(
    0,
    meta.totalItems - (meta.page - 1) * meta.limit,
  );
  const expectedItems =
    meta.totalPages === 0 || meta.page > meta.totalPages
      ? 0
      : Math.min(meta.limit, availableItems);
  if (items.length !== expectedItems) fail();

  return {
    capabilities: { facets: 'available', pagination: 'available' },
    items,
    kind: 'paged',
    meta,
  };
}

function projectLegacyProduct(value: unknown): LegacyCatalogProduct {
  if (!isRecord(value)) fail();
  if (Object.keys(value).some((key) => LEGACY_PROHIBITED_KEYS.has(key))) {
    fail();
  }
  return projectCommonProduct(value);
}

function projectPagedProduct(value: unknown): PagedCatalogProduct {
  if (!isRecord(value)) fail();
  const common = projectCommonProduct(value);
  if (
    typeof value.teaser !== 'string' ||
    typeof value.priceQualifier !== 'string' ||
    typeof value.imagePath !== 'string' ||
    !IMAGE_PATH.test(value.imagePath) ||
    (value.availability !== 'in-stock' && value.availability !== 'out-of-stock')
  ) {
    fail();
  }

  return {
    ...common,
    availability: value.availability,
    category: projectCategory(value.category),
    imagePath: value.imagePath,
    priceQualifier: value.priceQualifier,
    teaser: value.teaser,
  };
}

function projectCommonProduct(
  value: Record<string, unknown>,
): LegacyCatalogProduct {
  if (
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.slug !== 'string' ||
    !SLUG.test(value.slug) ||
    typeof value.description !== 'string' ||
    !isInt32(value.priceMinor) ||
    value.currency !== 'USD'
  ) {
    fail();
  }

  return {
    currency: 'USD',
    description: value.description,
    id: value.id,
    name: value.name,
    priceMinor: value.priceMinor,
    slug: value.slug,
  };
}

function projectCategory(value: unknown): ProductCategory {
  if (
    !isRecord(value) ||
    typeof value.slug !== 'string' ||
    !SLUG.test(value.slug) ||
    typeof value.name !== 'string' ||
    value.name.length === 0
  ) {
    fail();
  }
  return { name: value.name, slug: value.slug };
}

function projectMeta(value: unknown): CatalogMeta {
  if (!isRecord(value) || !isRecord(value.filters) || !isRecord(value.facets)) {
    fail();
  }
  const categories = value.facets.categories;
  if (!Array.isArray(categories)) fail();
  const projectedCategories = categories.map(projectCategory);
  const filters = projectFilters(value.filters);

  if (
    !isBoundedInteger(value.page, 1, 200) ||
    !isBoundedInteger(value.limit, 1, 48) ||
    !isInt32(value.totalItems) ||
    !isBoundedInteger(value.totalPages, 0, 200) ||
    typeof value.hasNextPage !== 'boolean' ||
    typeof value.hasPreviousPage !== 'boolean' ||
    typeof value.sort !== 'string' ||
    !SORT_VALUES.has(value.sort) ||
    value.currency !== 'USD'
  ) {
    fail();
  }

  const expectedPages =
    value.totalItems === 0
      ? 0
      : Math.min(200, Math.ceil(value.totalItems / value.limit));
  if (
    value.totalPages !== expectedPages ||
    value.hasNextPage !== value.page < value.totalPages ||
    value.hasPreviousPage !== (value.totalPages > 0 && value.page > 1)
  ) {
    fail();
  }

  return {
    currency: 'USD',
    facets: { categories: projectedCategories },
    filters,
    hasNextPage: value.hasNextPage,
    hasPreviousPage: value.hasPreviousPage,
    limit: value.limit,
    page: value.page,
    sort: value.sort as CatalogMeta['sort'],
    totalItems: value.totalItems,
    totalPages: value.totalPages,
  };
}

function projectFilters(
  value: Record<string, unknown>,
): CatalogMeta['filters'] {
  const { category, maxPriceMinor, minPriceMinor, search } = value;
  if (
    !isNullableCategory(category) ||
    !isNullableInt32(minPriceMinor) ||
    !isNullableInt32(maxPriceMinor) ||
    !isNullableSearch(search) ||
    (typeof minPriceMinor === 'number' &&
      typeof maxPriceMinor === 'number' &&
      minPriceMinor > maxPriceMinor)
  ) {
    fail();
  }
  return { category, maxPriceMinor, minPriceMinor, search };
}

function isNullableSearch(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || value !== value.normalize('NFC'))
    return false;
  if (
    Array.from(value).length < 2 ||
    Array.from(value).length > 80 ||
    value.trim() !== value ||
    value.replace(/\p{White_Space}+/gu, ' ') !== value ||
    SEARCH_FORBIDDEN.test(value)
  ) {
    return false;
  }
  const tokens = value.split(' ');
  return (
    tokens.length <= 8 &&
    tokens.every((token) => Array.from(token).length <= 32)
  );
}

function isNullableCategory(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && SLUG.test(value) && value.length <= 64)
  );
}

function isNullableInt32(value: unknown): value is number | null {
  return value === null || isInt32(value);
}

function isInt32(value: unknown): value is number {
  return isBoundedInteger(value, 0, MAX_INT32);
}

function isBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(): never {
  throw new CatalogResponseShapeError();
}
