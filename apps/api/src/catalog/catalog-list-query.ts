import {
  empty as sqlEmpty,
  join as sqlJoin,
  sqltag as sql,
} from '@prisma/client/runtime/client';
import type { Prisma } from '../generated/prisma/client';
import type {
  AdminCatalogQueryDto,
  CatalogQueryDto,
  CatalogSort,
} from './dto/catalog-query.dto';
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

const CATALOG_SEARCH_SORT_ORDER: Record<CatalogSort, Prisma.Sql> = {
  'name-asc': sql`p."name" ASC, p."slug" ASC`,
  'name-desc': sql`p."name" DESC, p."slug" ASC`,
  'price-asc': sql`p."priceMinor" ASC, p."name" ASC, p."slug" ASC`,
  'price-desc': sql`p."priceMinor" DESC, p."name" ASC, p."slug" ASC`,
};

export function buildCatalogProductWhere(
  query: CatalogQueryDto | AdminCatalogQueryDto,
  visibility: CatalogListVisibility,
  evaluatedAt = new Date(),
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    currency: 'USD',
    ...(visibility === 'public'
      ? {
          ...buildPublicProductLifecycleWhere(evaluatedAt),
        }
      : {}),
  };

  if (query.category) {
    where.category = {
      slug: Array.isArray(query.category)
        ? { in: query.category }
        : query.category,
    };
  }
  if (query.search && visibility === 'admin') {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      ...query.search.split(' ').map((token) => ({
        OR: [
          { name: { contains: token, mode: 'insensitive' as const } },
          { teaser: { contains: token, mode: 'insensitive' as const } },
          { description: { contains: token, mode: 'insensitive' as const } },
        ],
      })),
    ];
  }
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
  evaluatedAt = new Date(),
) {
  return {
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
    select: {
      _count: {
        select: {
          products: {
            where: {
              currency: 'USD',
              ...(visibility === 'public'
                ? buildPublicProductLifecycleWhere(evaluatedAt)
                : {}),
            },
          },
        },
      },
      name: true,
      slug: true,
    },
    where: {
      ...(visibility === 'admin'
        ? { slug: { in: [...CATALOG_INGREDIENT_PRODUCT_TYPE_SLUGS] } }
        : {}),
      products: {
        some: {
          currency: 'USD',
          ...(visibility === 'public'
            ? buildPublicProductLifecycleWhere(evaluatedAt)
            : {}),
        },
      },
    },
  } satisfies Prisma.CategoryFindManyArgs;
}

export function buildCatalogSearchCountQuery(
  query: CatalogQueryDto,
  evaluatedAt: Date,
): Prisma.Sql {
  return sql`
    SELECT COUNT(*)::integer AS "totalItems"
    FROM "Product" p
    INNER JOIN "Category" c ON c."id" = p."categoryId"
    WHERE ${buildCatalogSearchWhere(query, evaluatedAt)}
  `;
}

export function buildCatalogSearchPageQuery(
  query: CatalogQueryDto,
  evaluatedAt: Date,
): Prisma.Sql {
  return sql`
    SELECT p."id"
    FROM "Product" p
    INNER JOIN "Category" c ON c."id" = p."categoryId"
    WHERE ${buildCatalogSearchWhere(query, evaluatedAt)}
    ORDER BY ${CATALOG_SEARCH_SORT_ORDER[query.sort]}
    LIMIT ${query.limit}
    OFFSET ${(query.page - 1) * query.limit}
  `;
}

function buildCatalogSearchWhere(
  query: CatalogQueryDto,
  evaluatedAt: Date,
): Prisma.Sql {
  if (!query.search) {
    throw new TypeError('A normalized search value is required');
  }

  const categories = query.category?.length
    ? sql`AND c."slug" IN (${sqlJoin(query.category)})`
    : sqlEmpty;
  const minimumPrice =
    query.minPriceMinor === undefined
      ? sqlEmpty
      : sql`AND p."priceMinor" >= ${query.minPriceMinor}`;
  const maximumPrice =
    query.maxPriceMinor === undefined
      ? sqlEmpty
      : sql`AND p."priceMinor" <= ${query.maxPriceMinor}`;

  return sql`
    p."currency" = 'USD'
    AND p."isActive" = true
    AND (p."activeFrom" IS NULL OR p."activeFrom" <= ${evaluatedAt})
    AND (p."activeUntil" IS NULL OR p."activeUntil" > ${evaluatedAt})
    AND p."searchDocument" @@ websearch_to_tsquery('simple', ${query.search})
    ${categories}
    ${minimumPrice}
    ${maximumPrice}
  `;
}

export function buildPublicProductLifecycleWhere(
  evaluatedAt: Date,
): Prisma.ProductWhereInput {
  return {
    AND: [
      { OR: [{ activeFrom: null }, { activeFrom: { lte: evaluatedAt } }] },
      { OR: [{ activeUntil: null }, { activeUntil: { gt: evaluatedAt } }] },
    ],
    isActive: true,
  };
}
