import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CatalogQueryDto, CatalogSort } from './dto/catalog-query.dto';
import type { CatalogResponseDto } from './dto/catalog-response.dto';

const productSelect = {
  category: { select: { name: true, slug: true } },
  currency: true,
  description: true,
  id: true,
  imagePath: true,
  name: true,
  priceMinor: true,
  priceQualifier: true,
  slug: true,
  stockQuantity: true,
  teaser: true,
} satisfies Prisma.ProductSelect;

const facetQuery = {
  orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
  select: { name: true, slug: true },
  where: {
    products: { some: { currency: 'USD', isActive: true } },
  },
} satisfies Prisma.CategoryFindManyArgs;

const sortOrder: Record<CatalogSort, Prisma.ProductOrderByWithRelationInput[]> =
  {
    'name-asc': [{ name: 'asc' }, { slug: 'asc' }],
    'name-desc': [{ name: 'desc' }, { slug: 'asc' }],
    'price-asc': [{ priceMinor: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
    'price-desc': [{ priceMinor: 'desc' }, { name: 'asc' }, { slug: 'asc' }],
  };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: CatalogQueryDto): Promise<CatalogResponseDto> {
    const where = buildProductWhere(query);
    const { categories, products, totalItems } = await this.prisma.$transaction(
      async (transaction) => {
        const [count, items, facets] = await Promise.all([
          transaction.product.count({ where }),
          transaction.product.findMany({
            orderBy: sortOrder[query.sort],
            select: productSelect,
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
      items: products.map(({ stockQuantity, ...product }) => ({
        ...product,
        availability: stockQuantity > 0 ? 'in-stock' : 'out-of-stock',
        currency: 'USD',
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

function buildProductWhere(query: CatalogQueryDto): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    currency: 'USD',
    isActive: true,
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
