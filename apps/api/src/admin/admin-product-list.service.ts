import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import {
  buildCatalogFacetQuery,
  buildCatalogProductWhere,
  CATALOG_PRODUCT_SORT_ORDER,
} from '../catalog/catalog-list-query';
import type { CatalogQueryDto } from '../catalog/dto/catalog-query.dto';
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
    query: CatalogQueryDto,
  ): Promise<AdminProductListResponseDto> {
    const evaluatedAt = new Date();
    const where = buildCatalogProductWhere(query, 'admin');
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
        currency: 'USD',
        lifecycleStatus: resolveAdminProductLifecycle(product, evaluatedAt),
      })),
      meta: {
        currency: 'USD',
        facets: { categories },
        filters: {
          category: query.category ?? null,
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
  return 'ACTIVE';
}
