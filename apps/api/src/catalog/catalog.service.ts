import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { CatalogQueryDto } from './dto/catalog-query.dto';
import type { CatalogResponseDto } from './dto/catalog-response.dto';
import type {
  ProductDetailDto,
  ProductSpecificationDto,
} from './dto/product-detail.dto';
import {
  buildCatalogFacetQuery,
  buildCatalogProductWhere,
  buildPublicProductLifecycleWhere,
  CATALOG_PRODUCT_SORT_ORDER,
} from './catalog-list-query';

const productSelect = {
  amountUnit: true,
  category: { select: { name: true, slug: true } },
  currency: true,
  description: true,
  id: true,
  imagePath: true,
  kitYieldVolumeMl: true,
  maximumOrderAmount: true,
  minimumOrderAmount: true,
  name: true,
  orderStepAmount: true,
  packageNetWeightMg: true,
  priceBasisAmount: true,
  priceMinor: true,
  priceQualifier: true,
  saleKind: true,
  slug: true,
  stockAmount: true,
  teaser: true,
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...productSelect,
  specifications: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getProduct(slug: string): Promise<ProductDetailDto> {
    const evaluatedAt = new Date();
    const product = await this.prisma.product.findFirst({
      select: productDetailSelect,
      where: {
        currency: 'USD',
        slug,
        ...buildPublicProductLifecycleWhere(evaluatedAt),
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    const { specifications, ...publicProduct } = product;

    return {
      ...publicProduct,
      availability:
        product.stockAmount >= product.minimumOrderAmount
          ? 'in-stock'
          : 'out-of-stock',
      currency: 'USD',
      specifications: parseProductSpecifications(specifications),
    };
  }

  async listProducts(query: CatalogQueryDto): Promise<CatalogResponseDto> {
    const evaluatedAt = new Date();
    const where = buildCatalogProductWhere(query, 'public', evaluatedAt);
    const facetQuery = buildCatalogFacetQuery('public', evaluatedAt);
    const { categories, products, totalItems } = await this.prisma.$transaction(
      async (transaction) => {
        const [count, items, facets] = await Promise.all([
          transaction.product.count({ where }),
          transaction.product.findMany({
            orderBy: CATALOG_PRODUCT_SORT_ORDER[query.sort],
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
      items: products.map((product) => ({
        ...product,
        availability:
          product.stockAmount >= product.minimumOrderAmount
            ? 'in-stock'
            : 'out-of-stock',
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

function parseProductSpecifications(
  value: Prisma.JsonValue,
): ProductSpecificationDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('Stored product specifications are invalid');
  }

  return value.map((specification) => {
    if (!isProductSpecification(specification)) {
      throw new TypeError('Stored product specifications are invalid');
    }

    return {
      label: specification.label,
      value: Array.isArray(specification.value)
        ? [...specification.value]
        : specification.value,
    };
  });
}

type StoredProductSpecification = {
  label: string;
  value: string | string[];
};

function isProductSpecification(
  value: unknown,
): value is StoredProductSpecification {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  const label = record.label;
  const specificationValue = record.value;

  return (
    typeof label === 'string' &&
    label.trim().length > 0 &&
    (isNonEmptyString(specificationValue) ||
      (Array.isArray(specificationValue) &&
        specificationValue.length > 0 &&
        specificationValue.every(isNonEmptyString)))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
