import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  buildCatalogFacetQuery,
  buildCatalogProductWhere,
  CATALOG_PRODUCT_SORT_ORDER,
} from '../catalog/catalog-list-query';
import type { AdminCatalogQueryDto } from '../catalog/dto/catalog-query.dto';
import { PrismaService } from '../database/prisma.service';
import type {
  AdminProductLifecycleStatus,
  AdminProductListResponseDto,
} from './dto/admin-product-list.dto';

const adminProductSelect = {
  activeFrom: true,
  activeUntil: true,
  amountUnit: true,
  category: { select: { name: true, slug: true } },
  createdAt: true,
  currency: true,
  description: true,
  id: true,
  imagePath: true,
  isActive: true,
  name: true,
  priceMinor: true,
  priceQualifier: true,
  saleKind: true,
  slug: true,
  stockAmount: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

type LifecycleProduct = Pick<
  Prisma.ProductGetPayload<Record<string, never>>,
  'activeFrom' | 'activeUntil' | 'isActive'
>;

@Injectable()
export class AdminProductListService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(
    query: AdminCatalogQueryDto,
  ): Promise<AdminProductListResponseDto> {
    const evaluatedAt = new Date();
    const where = buildCatalogProductWhere(query, 'admin');
    const lifecycleWhere = buildLifecycleWhere(query.lifecycle, evaluatedAt);
    if (lifecycleWhere) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        lifecycleWhere,
      ];
    }
    const facetQuery = buildCatalogFacetQuery('admin');
    const { categories, products, totalItems } = await this.prisma.$transaction(
      async (transaction) => {
        const [count, items, facets] = await Promise.all([
          transaction.product.count({ where }),
          transaction.product.findMany({
            orderBy: CATALOG_PRODUCT_SORT_ORDER[query.sort],
            select: adminProductSelect,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            where,
          }),
          transaction.category.findMany(facetQuery),
        ]);

        return { categories: facets, products: items, totalItems: count };
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const totalPages =
      totalItems === 0 ? 0 : Math.min(200, Math.ceil(totalItems / query.limit));

    return {
      items: products.map((product) => ({
        ...product,
        currency: 'EUR',
        lifecycleStatus: resolveAdminProductLifecycle(product, evaluatedAt),
      })),
      meta: {
        currency: 'EUR',
        facets: {
          categories: categories.map(({ name, slug }) => ({ name, slug })),
        },
        filters: {
          category: query.category ?? null,
          lifecycle: query.lifecycle ?? null,
          maxPriceMinor: query.maxPriceMinor ?? null,
          minPriceMinor: query.minPriceMinor ?? null,
          search: query.search ?? null,
        },
        hasNextPage: query.page < totalPages,
        hasPreviousPage: totalPages > 0 && query.page > 1,
        limit: query.limit,
        page: query.page,
        sort: query.sort,
        totalItems,
        totalPages,
      },
    };
  }
}

export function resolveAdminProductLifecycle(
  product: LifecycleProduct,
  evaluatedAt: Date,
): AdminProductLifecycleStatus {
  if (!product.isActive) return 'DISABLED';
  if (product.activeFrom && product.activeFrom > evaluatedAt)
    return 'SCHEDULED';
  if (product.activeUntil && product.activeUntil <= evaluatedAt)
    return 'EXPIRED';
  if (
    product.activeUntil &&
    product.activeUntil <= new Date(evaluatedAt.getTime() + 7 * 86_400_000)
  ) {
    return 'ENDING_SOON';
  }
  return 'ACTIVE';
}

function buildLifecycleWhere(
  lifecycle: AdminCatalogQueryDto['lifecycle'],
  now: Date,
): Prisma.ProductWhereInput | undefined {
  if (!lifecycle) return undefined;
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  switch (lifecycle) {
    case 'DISABLED':
      return { isActive: false };
    case 'SCHEDULED':
      return { activeFrom: { gt: now }, isActive: true };
    case 'EXPIRED':
      return { activeUntil: { lte: now }, isActive: true };
    case 'ENDING_SOON':
      return {
        AND: [{ OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] }],
        activeUntil: { gt: now, lte: soon },
        isActive: true,
      };
    case 'ACTIVE':
      return {
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ activeUntil: null }, { activeUntil: { gt: soon } }] },
        ],
        isActive: true,
      };
  }
}
