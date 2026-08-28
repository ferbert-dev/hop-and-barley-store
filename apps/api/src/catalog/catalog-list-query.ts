import type { Prisma } from '../generated/prisma/client';
import type { CatalogQueryDto, CatalogSort } from './dto/catalog-query.dto';
import { CATALOG_INGREDIENT_PRODUCT_TYPE_SLUGS } from './catalog-product-types';

export type CatalogListVisibility = 'admin' | 'public';

export const CATALOG_PRODUCT_SORT_ORDER: Record<
  CatalogSort,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  'name-asc': [{ name: 'asc' }, { slug: 'asc' }],
  'name-desc': [{ name: 'desc' }, { slug: 'asc' }],
  'price-asc': [{ priceMinor: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
  'price-desc': [{ priceMinor: 'desc' }, { name: 'asc' }, { slug: 'asc' }],
};

export function buildCatalogProductWhere(
  query: CatalogQueryDto,
  visibility: CatalogListVisibility,
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    currency: 'USD',
    ...(visibility === 'public' ? { isActive: true } : {}),
  };

  if (query.search) {
    where.AND = query.search.split(' ').map((token) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { teaser: { contains: token, mode: 'insensitive' } },
        { description: { contains: token, mode: 'insensitive' } },
      ],
    }));
  }
  if (query.category) where.category = { slug: query.category };
  if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) {
    where.priceMinor = {
      ...(query.minPriceMinor === undefined
        ? {}
        : { gte: query.minPriceMinor }),
      ...(query.maxPriceMinor === undefined
        ? {}
        : { lte: query.maxPriceMinor }),
    };
  }

  return where;
}

export function buildCatalogFacetQuery(
  visibility: CatalogListVisibility,
): Prisma.CategoryFindManyArgs {
  return {
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
    select: { name: true, slug: true },
    where: {
      slug: { in: [...CATALOG_INGREDIENT_PRODUCT_TYPE_SLUGS] },
      products: {
        some: {
          currency: 'USD',
          ...(visibility === 'public' ? { isActive: true } : {}),
        },
      },
    },
  };
}
