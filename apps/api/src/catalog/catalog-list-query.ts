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
import { CATALOG_ADMIN_PRODUCT_TYPES } from './catalog-product-types';

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
    currency: 'EUR',
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
  query?: CatalogQueryDto | AdminCatalogQueryDto,
) {
  const facetProductWhere = query
    ? buildCatalogProductWhere(
        { ...query, category: undefined },
        visibility,
        evaluatedAt,
      )
    : {
        currency: 'EUR' as const,
        ...(visibility === 'public'
          ? buildPublicProductLifecycleWhere(evaluatedAt)
          : {}),
      };

  return {
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
    select: {
      _count: {
        select: {
          products: {
            where: facetProductWhere,
          },
        },
      },
      name: true,
      slug: true,
    },
    where: {
      ...(visibility === 'admin'
        ? { slug: { in: CATALOG_ADMIN_PRODUCT_TYPES.map(({ slug }) => slug) } }
        : {}),
      products: {
        some: {
          currency: 'EUR',
          ...(visibility === 'public'
            ? buildPublicProductLifecycleWhere(evaluatedAt)
            : {}),
        },
      },
    },
  } satisfies Prisma.CategoryFindManyArgs;
}

export function buildCatalogSearchFacetQuery(
  query: CatalogQueryDto,
  evaluatedAt: Date,
): Prisma.Sql {
  return sql`
    SELECT
      COUNT(p."id")::integer AS "count",
      c."name",
      c."slug"
    FROM "Category" c
    LEFT JOIN "Product" p
      ON p."categoryId" = c."id"
      AND ${buildCatalogSearchProductWhere(query, evaluatedAt)}
    WHERE EXISTS (
      SELECT 1
      FROM "Product" visible
      WHERE visible."categoryId" = c."id"
        AND visible."currency" = 'EUR'
        AND visible."isActive" = true
        AND (visible."activeFrom" IS NULL OR visible."activeFrom" <= ${evaluatedAt})
        AND (visible."activeUntil" IS NULL OR visible."activeUntil" > ${evaluatedAt})
    )
    GROUP BY c."id", c."displayOrder", c."name", c."slug"
    ORDER BY c."displayOrder" ASC, c."name" ASC, c."slug" ASC
  `;
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
  const categories = query.category?.length
    ? sql`AND c."slug" IN (${sqlJoin(query.category)})`
    : sqlEmpty;
  return sql`
    ${buildCatalogSearchProductWhere(query, evaluatedAt)}
    ${categories}
  `;
}

function buildCatalogSearchProductWhere(
  query: CatalogQueryDto,
  evaluatedAt: Date,
): Prisma.Sql {
  if (!query.search) {
    throw new TypeError('A normalized search value is required');
  }

  const minimumPrice =
    query.minPriceMinor === undefined
      ? sqlEmpty
      : sql`AND p."priceMinor" >= ${query.minPriceMinor}`;
  const maximumPrice =
    query.maxPriceMinor === undefined
      ? sqlEmpty
      : sql`AND p."priceMinor" <= ${query.maxPriceMinor}`;

  return sql`
    p."currency" = 'EUR'
    AND p."isActive" = true
    AND (p."activeFrom" IS NULL OR p."activeFrom" <= ${evaluatedAt})
    AND (p."activeUntil" IS NULL OR p."activeUntil" > ${evaluatedAt})
    AND p."searchDocument" @@ ${buildCatalogPrefixTsQuery(query.search)}
    ${minimumPrice}
    ${maximumPrice}
  `;
}

function buildCatalogPrefixTsQuery(search: string): Prisma.Sql {
  return sql`(
    SELECT to_tsquery(
      'simple',
      string_agg(quote_literal(term) || ':*A', ' & ')
    )
    FROM unnest(
      tsvector_to_array(to_tsvector('simple', ${search}))
    ) AS term
  )`;
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
