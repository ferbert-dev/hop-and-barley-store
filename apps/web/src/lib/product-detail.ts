import { createApiClient, type components } from '@hop-and-barley/api-client';
import { cache } from 'react';

import { readQuantityMetadata } from '../features/quantity/quantity-model';
import { resolveApiOrigin } from './catalog';
import { isProductImagePath } from './product-image';

const DEFAULT_API_URL = 'http://127.0.0.1:3001/api/v1';
const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROHIBITED_PRODUCT_FIELDS = [
  'categoryId',
  'isActive',
  'stockQuantity',
] as const;

export const PRODUCT_DETAIL_REQUEST_TIMEOUT_MS = 1_000;

export type ProductDetailProduct = components['schemas']['ProductDetailDto'];

export type ProductDetailLoadResult =
  | { kind: 'not-found' }
  | { kind: 'ready'; product: ProductDetailProduct }
  | { kind: 'unavailable' };

export async function loadProductDetail(
  slug: string,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<ProductDetailLoadResult> {
  if (!isProductSlug(slug)) return { kind: 'not-found' };

  try {
    const client = createApiClient(resolveApiOrigin(rawApiUrl), {
      requestInitExt: { next: { revalidate: 60 } } satisfies RequestInit,
    });
    const { data, error, response } = await client.GET(
      '/api/v1/products/{slug}',
      {
        params: { path: { slug } },
        signal: AbortSignal.timeout(PRODUCT_DETAIL_REQUEST_TIMEOUT_MS),
      },
    );

    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok || error !== undefined || data === undefined) {
      return { kind: 'unavailable' };
    }

    const product = normalizeProductDetail(data);
    return product.slug === slug
      ? { kind: 'ready', product }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export const getProductDetail = cache(loadProductDetail);

function normalizeProductDetail(value: unknown): ProductDetailProduct {
  if (!isRecord(value)) throw new TypeError('Invalid product detail response');
  if (PROHIBITED_PRODUCT_FIELDS.some((field) => field in value)) {
    throw new TypeError('Invalid product detail response');
  }

  const {
    availability,
    category,
    currency,
    description,
    id,
    imagePath,
    name,
    priceMinor,
    priceQualifier,
    slug,
    stockAmount,
    specifications,
    teaser,
  } = value;
  const quantityMetadata = readQuantityMetadata(value);

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(name) ||
    !isProductSlug(slug) ||
    !isNonEmptyString(description) ||
    !Number.isSafeInteger(priceMinor) ||
    (priceMinor as number) < 0 ||
    !Number.isSafeInteger(stockAmount) ||
    (stockAmount as number) < 0 ||
    currency !== 'USD' ||
    !isNonEmptyString(teaser) ||
    !isNonEmptyString(priceQualifier) ||
    !isProductImagePath(imagePath) ||
    (availability !== 'in-stock' && availability !== 'out-of-stock') ||
    !isCategory(category) ||
    !Array.isArray(specifications) ||
    specifications.length === 0 ||
    !specifications.every(isSpecification) ||
    quantityMetadata === null
  ) {
    throw new TypeError('Invalid product detail response');
  }

  return {
    availability,
    category: { name: category.name, slug: category.slug },
    currency,
    description,
    id,
    imagePath,
    name,
    priceMinor: priceMinor as number,
    priceQualifier,
    slug,
    stockAmount: stockAmount as number,
    specifications: specifications.map(
      ({ label, value: specificationValue }) => ({
        label,
        value: Array.isArray(specificationValue)
          ? [...specificationValue]
          : specificationValue,
      }),
    ),
    teaser,
    ...quantityMetadata,
  };
}

function isProductSlug(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    PRODUCT_SLUG_PATTERN.test(value)
  );
}

function isCategory(value: unknown): value is ProductDetailProduct['category'] {
  return (
    isRecord(value) && isProductSlug(value.slug) && isNonEmptyString(value.name)
  );
}

function isSpecification(
  value: unknown,
): value is ProductDetailProduct['specifications'][number] {
  if (!isRecord(value) || !isNonEmptyString(value.label)) return false;

  return (
    isNonEmptyString(value.value) ||
    (Array.isArray(value.value) &&
      value.value.length > 0 &&
      value.value.every(isNonEmptyString))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
