import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { catalogCategories, catalogProducts } from '../prisma/catalog-fixtures';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import type { Prisma } from '../src/generated/prisma/client';
import type { CatalogResponseDto } from '../src/catalog/dto/catalog-response.dto';
import type { ProductDetailDto } from '../src/catalog/dto/product-detail.dto';
import { PrismaService } from '../src/database/prisma.service';

const runPostgresIntegration =
  process.env.RUN_CATALOG_POSTGRES_INTEGRATION === '1';
const describePostgres = runPostgresIntegration ? describe : describe.skip;

type ConstraintCase = {
  constraint: string;
  overrides?: Record<string, number | string>;
  sql?: string;
};

describePostgres('C2 catalog discovery with PostgreSQL 17.6 (e2e)', () => {
  let app: INestApplication;
  let postgres: Client;
  let prisma: PrismaService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  async function getCatalog(query = ''): Promise<CatalogResponseDto> {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/v1/products${query}`)
      .expect(200);
    return JSON.parse(response.text) as CatalogResponseDto;
  }

  it('persists the exact deterministic category and product identities', async () => {
    const categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      select: { displayOrder: true, id: true, name: true, slug: true },
    });
    const products = await prisma.product.findMany({
      orderBy: { id: 'asc' },
      select: {
        currency: true,
        id: true,
        imagePath: true,
        isActive: true,
        priceMinor: true,
        saleKind: true,
        slug: true,
        specifications: true,
        stockAmount: true,
      },
    });

    expect(categories).toEqual(catalogCategories);
    expect(products).toHaveLength(12);
    expect(products.map(({ id, slug }) => ({ id, slug }))).toEqual(
      catalogProducts
        .map(({ id, slug }) => ({ id, slug }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(
      products.every(({ currency, isActive, saleKind, slug, stockAmount }) => {
        const fixture = catalogProducts.find(
          (candidate) => candidate.slug === slug,
        );
        return (
          fixture !== undefined &&
          currency === 'USD' &&
          isActive &&
          saleKind === fixture.saleKind &&
          stockAmount === fixture.stockAmount
        );
      }),
    ).toBe(true);

    const kit = products.find(({ slug }) => slug === 'west-coast-ipa-kit');
    expect(kit?.specifications).toEqual(
      catalogProducts.find(({ slug }) => slug === 'west-coast-ipa-kit')
        ?.specifications,
    );
  });

  it('returns one exact ordered product detail without persistence fields', async () => {
    const expected = catalogProducts.find(({ slug }) => slug === 'citra-hops');
    if (!expected) throw new Error('Missing Citra fixture');

    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/products/citra-hops')
      .expect(200);
    const body = JSON.parse(response.text) as ProductDetailDto;

    expect(body).toEqual({
      amountUnit: expected.amountUnit,
      availability: 'in-stock',
      category: { name: 'Hops', slug: 'hops' },
      currency: 'USD',
      description: expected.description,
      id: expected.id,
      imagePath: expected.imagePath,
      kitYieldVolumeMl: expected.kitYieldVolumeMl,
      maximumOrderAmount: expected.maximumOrderAmount,
      minimumOrderAmount: expected.minimumOrderAmount,
      name: expected.name,
      orderStepAmount: expected.orderStepAmount,
      packageNetWeightMg: expected.packageNetWeightMg,
      priceBasisAmount: expected.priceBasisAmount,
      priceMinor: expected.priceMinor,
      priceQualifier: expected.priceQualifier,
      saleKind: expected.saleKind,
      slug: expected.slug,
      specifications: expected.specifications,
      stockAmount: expected.stockAmount,
      teaser: expected.teaser,
    });
    expect(Object.keys(body).sort()).toEqual([
      'amountUnit',
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'kitYieldVolumeMl',
      'maximumOrderAmount',
      'minimumOrderAmount',
      'name',
      'orderStepAmount',
      'packageNetWeightMg',
      'priceBasisAmount',
      'priceMinor',
      'priceQualifier',
      'saleKind',
      'slug',
      'specifications',
      'stockAmount',
      'teaser',
    ]);
  });

  it('returns the default 12-item USD envelope and product-backed base facets', async () => {
    const hops = catalogCategories.find(({ slug }) => slug === 'hops');
    if (!hops) throw new Error('Missing hops fixture');

    await prisma.category.createMany({
      data: [
        {
          displayOrder: 0,
          id: '30000000-0000-4000-8000-000000000010',
          name: 'Excluded currency',
          slug: 'excluded-currency',
        },
        {
          displayOrder: 0,
          id: '30000000-0000-4000-8000-000000000011',
          name: 'Excluded inactive',
          slug: 'excluded-inactive',
        },
        {
          displayOrder: 0,
          id: '30000000-0000-4000-8000-000000000012',
          name: 'Excluded orphan',
          slug: 'excluded-orphan',
        },
      ],
    });
    await prisma.product.createMany({
      data: [
        productFixture({
          categoryId: hops.id,
          id: '30000000-0000-4000-8000-000000000001',
          isActive: false,
          slug: 'hidden-inactive',
        }),
        productFixture({
          categoryId: '30000000-0000-4000-8000-000000000010',
          currency: 'EUR',
          id: '30000000-0000-4000-8000-000000000002',
          slug: 'hidden-eur',
        }),
        productFixture({
          categoryId: '30000000-0000-4000-8000-000000000011',
          id: '30000000-0000-4000-8000-000000000003',
          isActive: false,
          slug: 'hidden-inactive-category',
        }),
      ],
    });

    try {
      const body = await getCatalog();

      expect(body.items).toHaveLength(12);
      expect(body.meta).toMatchObject({
        currency: 'USD',
        hasNextPage: false,
        hasPreviousPage: false,
        limit: 12,
        page: 1,
        sort: 'name-asc',
        totalItems: 12,
        totalPages: 1,
      });
      expect(body.items.every(({ currency }) => currency === 'USD')).toBe(true);
      expect(body.items.map(({ slug }) => slug)).not.toEqual(
        expect.arrayContaining(['hidden-inactive', 'hidden-eur']),
      );
      expect(body.meta.facets.categories).toEqual(expectedCategoryFacets());
      expect(body.meta.facets.categories).not.toContainEqual({
        name: 'Excluded currency',
        slug: 'excluded-currency',
      });
      expect(body.meta.facets.categories).not.toEqual(
        expect.arrayContaining([
          { name: 'Excluded inactive', slug: 'excluded-inactive' },
          { name: 'Excluded orphan', slug: 'excluded-orphan' },
        ]),
      );
      for (const slug of ['hidden-inactive', 'hidden-eur', 'missing-product']) {
        const hidden = await request(app.getHttpServer() as App)
          .get(`/api/v1/products/${slug}`)
          .expect(404);
        expect(hidden.body).toEqual({
          error: 'Not Found',
          message: 'Product not found',
          statusCode: 404,
        });
      }
    } finally {
      await prisma.product.deleteMany({
        where: {
          slug: {
            in: ['hidden-inactive', 'hidden-eur', 'hidden-inactive-category'],
          },
        },
      });
      await prisma.category.deleteMany({
        where: {
          slug: {
            in: ['excluded-currency', 'excluded-inactive', 'excluded-orphan'],
          },
        },
      });
    }
  });

  it('applies grounded token, category and price filters with stable paging', async () => {
    const query =
      '?search=hops&category=hops&minPriceMinor=500&maxPriceMinor=800&sort=price-asc&limit=2';
    const first = await getCatalog(`${query}&page=1`);
    const repeatedFirst = await getCatalog(`${query}&page=1`);
    const second = await getCatalog(`${query}&page=2`);

    expect(first).toEqual(repeatedFirst);
    expect(
      first.items.map(({ priceMinor, slug }) => ({ priceMinor, slug })),
    ).toEqual([
      { priceMinor: 599, slug: 'citra-hops' },
      { priceMinor: 620, slug: 'centennial-hops' },
    ]);
    expect(
      second.items.map(({ priceMinor, slug }) => ({ priceMinor, slug })),
    ).toEqual([{ priceMinor: 749, slug: 'cascade-hops' }]);
    expect(first.meta).toMatchObject({
      filters: {
        category: ['hops'],
        maxPriceMinor: 800,
        minPriceMinor: 500,
        search: 'hops',
      },
      hasNextPage: true,
      hasPreviousPage: false,
      limit: 2,
      page: 1,
      sort: 'price-asc',
      totalItems: 3,
      totalPages: 2,
    });
    expect(second.meta).toMatchObject({
      hasNextPage: false,
      hasPreviousPage: true,
      page: 2,
      totalItems: 3,
      totalPages: 2,
    });
    expect(first.items.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(second.items.map(({ id }) => id)),
    );

    const fullwidthLiteral = await getCatalog('?search=ab％cd＿ef');
    expect(fullwidthLiteral.items).toEqual([]);
    expect(fullwidthLiteral.meta.totalItems).toBe(0);
  });

  it('combines full-text search with repeated product types using OR semantics', async () => {
    const body = await getCatalog(
      '?search=american&category=yeast&category=hops&sort=name-asc',
    );

    expect(body.items.length).toBeGreaterThan(1);
    expect(new Set(body.items.map(({ category }) => category.slug))).toEqual(
      new Set(['hops', 'yeast']),
    );
    expect(body.meta.filters).toMatchObject({
      category: ['yeast', 'hops'],
      search: 'american',
    });
  });

  it('keeps unique slug tie-breaks deterministic across page boundaries', async () => {
    const hops = catalogCategories.find(({ slug }) => slug === 'hops');
    if (!hops) throw new Error('Missing hops fixture');
    const slugs = ['boundary-a', 'boundary-b', 'boundary-c'];
    await prisma.product.createMany({
      data: slugs.map((slug, index) =>
        productFixture({
          categoryId: hops.id,
          id: `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          name: 'Boundary Hops',
          priceMinor: 111,
          slug,
          teaser: 'Boundary paging fixture',
        }),
      ),
    });

    try {
      const nameFirst = await getCatalog(
        '?search=boundary&sort=name-asc&limit=2&page=1',
      );
      const nameSecond = await getCatalog(
        '?search=boundary&sort=name-asc&limit=2&page=2',
      );
      const priceFirst = await getCatalog(
        '?search=boundary&sort=price-asc&limit=2&page=1',
      );
      const priceSecond = await getCatalog(
        '?search=boundary&sort=price-asc&limit=2&page=2',
      );

      expect(
        [...nameFirst.items, ...nameSecond.items].map(({ slug }) => slug),
      ).toEqual(slugs);
      expect(
        [...priceFirst.items, ...priceSecond.items].map(({ slug }) => slug),
      ).toEqual(slugs);
    } finally {
      await prisma.product.deleteMany({ where: { slug: { in: slugs } } });
    }
  });

  it('returns an empty unknown category without suppressing base facets', async () => {
    const body = await getCatalog('?category=unknown-category&page=7');

    expect(body.items).toEqual([]);
    expect(body.meta).toMatchObject({
      hasNextPage: false,
      hasPreviousPage: false,
      page: 7,
      totalItems: 0,
      totalPages: 0,
    });
    expect(body.meta.facets.categories).toEqual(expectedCategoryFacets());
  });

  it('holds the HTTP service count, items and facets to one repeatable-read snapshot', async () => {
    const categoryId = '32000000-0000-4000-8000-000000000001';
    const productId = '32000000-0000-4000-8000-000000000002';
    type TransactionRunner = <T>(
      callback: (transaction: Prisma.TransactionClient) => Promise<T>,
      options: { isolationLevel: 'RepeatableRead' },
    ) => Promise<T>;
    const transactionHost = prisma as unknown as {
      $transaction: TransactionRunner;
    };
    const originalTransaction = transactionHost.$transaction.bind(prisma);
    let releaseCount!: () => void;
    const countCompleted = new Promise<void>((resolve) => {
      releaseCount = resolve;
    });
    let writer: Promise<void> | undefined;
    const writeAfterCount = async () => {
      await countCompleted;
      writer ??= (async () => {
        await postgres.query(
          `INSERT INTO "Category" ("id", "name", "slug", "displayOrder", "updatedAt") VALUES ($1, 'Snapshot category', 'snapshot-category', 99, CURRENT_TIMESTAMP)`,
          [categoryId],
        );
        await postgres.query(
          `INSERT INTO "Product" ("id", "name", "slug", "teaser", "description", "priceMinor", "priceQualifier", "currency", "saleKind", "amountUnit", "priceBasisAmount", "minimumOrderAmount", "orderStepAmount", "stockAmount", "isActive", "imagePath", "specifications", "categoryId", "updatedAt") VALUES ($1, 'Snapshot product', 'snapshot-product', 'Snapshot product', 'Snapshot product', 1, 'fixture', 'USD', 'PACKAGE', 'EACH', 1, 1, 1, 1, true, '/assets/products/snapshot-product.webp', '[]'::jsonb, $2, CURRENT_TIMESTAMP)`,
          [productId, categoryId],
        );
      })();
      await writer;
    };
    const transactionSpy = jest
      .spyOn(transactionHost, '$transaction')
      .mockImplementation(async (callback, options) =>
        originalTransaction(async (transaction) => {
          const product = new Proxy(transaction.product, {
            get(target, property): unknown {
              if (property === 'count') {
                return async (args: Prisma.ProductCountArgs) => {
                  const count = await target.count(args);
                  releaseCount();
                  return count;
                };
              }
              if (property === 'findMany') {
                return async (args: Prisma.ProductFindManyArgs) => {
                  await writeAfterCount();
                  return target.findMany(args);
                };
              }
              return undefined;
            },
          });
          const category = new Proxy(transaction.category, {
            get(target, property) {
              if (property === 'findMany') {
                return async (args: Prisma.CategoryFindManyArgs) => {
                  await writeAfterCount();
                  return target.findMany(args);
                };
              }
              return undefined;
            },
          });
          const wrappedTransaction = new Proxy(transaction, {
            get(target, property) {
              if (property === 'product') return product;
              if (property === 'category') return category;
              if (property === '$queryRaw') {
                return async (...args: unknown[]) => {
                  const result = await (
                    target.$queryRaw as (
                      ...queryArgs: unknown[]
                    ) => Promise<unknown>
                  )(...args);
                  releaseCount();
                  return result;
                };
              }
              const value: unknown = Reflect.get(target, property);
              return value;
            },
          });
          return callback(wrappedTransaction);
        }, options),
      );

    try {
      const body = await getCatalog('?search=snapshot');

      expect(body.items).toEqual([]);
      expect(body.meta.totalItems).toBe(0);
      expect(body.meta.facets.categories).not.toContainEqual({
        name: 'Snapshot category',
        slug: 'snapshot-category',
      });
      expect(
        await prisma.product.findUnique({ where: { id: productId } }),
      ).not.toBeNull();
      expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
    } finally {
      transactionSpy.mockRestore();
      await postgres.query('DELETE FROM "Product" WHERE "id" = $1', [
        productId,
      ]);
      await postgres.query('DELETE FROM "Category" WHERE "id" = $1', [
        categoryId,
      ]);
    }
  });

  it('captures a parameterized catalog EXPLAIN plan without raw SQL in service', async () => {
    const explain = await postgres.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN (FORMAT TEXT) SELECT "id" FROM "Product" WHERE "isActive" = true AND "currency" = $1 ORDER BY "name" ASC, "slug" ASC LIMIT $2`,
      ['USD', 12],
    );

    expect(explain.rows.length).toBeGreaterThan(0);
    expect(explain.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'Limit',
    );
  });

  it.each<ConstraintCase>([
    {
      constraint: 'Category_displayOrder_nonnegative_check',
      sql: `INSERT INTO "Category" ("id", "name", "slug", "displayOrder", "updatedAt") VALUES ('40000000-0000-4000-8000-000000000001', 'Invalid', 'invalid-order', -1, CURRENT_TIMESTAMP)`,
    },
    {
      constraint: 'Category_slug_format_check',
      sql: `INSERT INTO "Category" ("id", "name", "slug", "displayOrder", "updatedAt") VALUES ('40000000-0000-4000-8000-000000000002', 'Invalid', 'Invalid Slug', 20, CURRENT_TIMESTAMP)`,
    },
    {
      constraint: 'Product_slug_format_check',
      overrides: { slug: 'Invalid Slug' },
    },
    {
      constraint: 'Product_priceMinor_nonnegative_check',
      overrides: { priceMinor: -1 },
    },
    {
      constraint: 'Product_stockAmount_nonnegative_check',
      overrides: { stockAmount: -1 },
    },
    {
      constraint: 'Product_currency_iso_check',
      overrides: { currency: 'usd' },
    },
    {
      constraint: 'Product_imagePath_local_check',
      overrides: { imagePath: 'https://example.com/product.webp' },
    },
    {
      constraint: 'Product_specifications_array_check',
      overrides: { specifications: '{}' },
    },
    {
      constraint: 'Product_active_content_check',
      overrides: { teaser: '' },
    },
  ])('enforces $constraint', async ({ constraint, overrides, sql }) => {
    const statement = sql ?? invalidProductInsert(overrides);

    await expect(postgres.query(statement)).rejects.toMatchObject({
      constraint,
    });
  });

  afterAll(async () => {
    await postgres?.end();
    await app?.close();
  });
});

function invalidProductInsert(
  overrides: Record<string, number | string> = {},
): string {
  const sequence = invalidProductSequence++;
  const values = {
    categoryId: '10000000-0000-4000-8000-000000000001',
    currency: 'USD',
    description: 'Constraint fixture',
    id: `50000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    imagePath: '/assets/products/constraint-fixture.webp',
    name: 'Constraint fixture',
    priceMinor: 1,
    priceQualifier: 'fixture',
    saleKind: 'PACKAGE',
    amountUnit: 'EACH',
    priceBasisAmount: 1,
    minimumOrderAmount: 1,
    orderStepAmount: 1,
    slug: `constraint-fixture-${sequence}`,
    specifications: '[]',
    stockAmount: 0,
    teaser: 'Constraint fixture',
    ...overrides,
  };

  return `
    INSERT INTO "Product" (
      "id", "name", "slug", "teaser", "description", "priceMinor",
      "priceQualifier", "currency", "saleKind", "amountUnit",
      "priceBasisAmount", "minimumOrderAmount", "orderStepAmount",
      "stockAmount", "isActive",
      "imagePath", "specifications", "categoryId", "updatedAt"
    ) VALUES (
      ${literal(values.id)}, ${literal(values.name)}, ${literal(values.slug)},
      ${literal(values.teaser)}, ${literal(values.description)}, ${values.priceMinor},
      ${literal(values.priceQualifier)}, ${literal(values.currency)},
      ${literal(values.saleKind)}::"SaleKind", ${literal(values.amountUnit)}::"AmountUnit",
      ${values.priceBasisAmount}, ${values.minimumOrderAmount}, ${values.orderStepAmount},
      ${values.stockAmount}, true, ${literal(values.imagePath)},
      ${literal(values.specifications)}::jsonb, ${literal(values.categoryId)}::uuid,
      CURRENT_TIMESTAMP
    )`;
}

function productFixture(
  overrides: Partial<Prisma.ProductCreateManyInput> &
    Pick<Prisma.ProductCreateManyInput, 'categoryId' | 'id' | 'slug'>,
): Prisma.ProductCreateManyInput {
  return {
    amountUnit: 'EACH',
    currency: 'USD',
    description: 'Integration fixture for grounded hops discovery',
    imagePath: `/assets/products/${overrides.slug}.webp`,
    isActive: true,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    name: 'Integration fixture',
    orderStepAmount: 1,
    packageNetWeightMg: null,
    priceBasisAmount: 1,
    priceMinor: 1,
    priceQualifier: 'fixture',
    saleKind: 'PACKAGE',
    specifications: [],
    stockAmount: 1,
    teaser: 'Integration hops fixture',
    ...overrides,
  };
}

let invalidProductSequence = 1;

function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function expectedCategoryFacets() {
  return catalogCategories
    .map((category) => ({
      count: catalogProducts.filter(
        (product) => product.categorySlug === category.slug,
      ).length,
      name: category.name,
      slug: category.slug,
    }))
    .filter(({ count }) => count > 0);
}
