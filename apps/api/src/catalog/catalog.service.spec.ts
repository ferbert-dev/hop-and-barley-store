import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { CatalogService } from './catalog.service';
import type { CatalogQueryDto } from './dto/catalog-query.dto';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

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
};

const saleRuleValues = {
  amountUnit: 'MILLIGRAM',
  kitYieldVolumeMl: null,
  maximumOrderAmount: null,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  saleKind: 'WEIGHT',
} as const;

const productDetailSelect = {
  ...productSelect,
  specifications: true,
};

const evaluatedAt = new Date('2026-08-28T17:00:00.000Z');
const publicLifecycleWhere = {
  AND: [
    { OR: [{ activeFrom: null }, { activeFrom: { lte: evaluatedAt } }] },
    { OR: [{ activeUntil: null }, { activeUntil: { gt: evaluatedAt } }] },
  ],
  isActive: true,
};

const facetQuery = {
  orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
  select: { name: true, slug: true },
  where: {
    products: { some: { currency: 'USD', ...publicLifecycleWhere } },
    slug: { in: ['hops', 'malts', 'yeast', 'adjuncts'] },
  },
};

describe('CatalogService', () => {
  const count = jest.fn();
  const findCategories = jest.fn();
  const findProducts = jest.fn();
  const rootCategoryFindMany = jest.fn();
  const rootProductCount = jest.fn();
  const rootProductFindFirst = jest.fn();
  const rootProductFindMany = jest.fn();
  const transaction = jest.fn();
  const transactionClient = {
    category: { findMany: findCategories },
    product: { count, findMany: findProducts },
  };
  let service: CatalogService;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(evaluatedAt);
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: transaction,
            category: { findMany: rootCategoryFindMany },
            product: {
              count: rootProductCount,
              findFirst: rootProductFindFirst,
              findMany: rootProductFindMany,
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(CatalogService);
    jest.clearAllMocks();
    transaction.mockImplementation(
      (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
    count.mockResolvedValue(1);
    findCategories.mockResolvedValue([{ name: 'Hops', slug: 'hops' }]);
    findProducts.mockResolvedValue([
      {
        ...saleRuleValues,
        category: { name: 'Hops', slug: 'hops' },
        currency: 'USD',
        description: 'Bright whole-cone hops',
        id: 'product-id',
        imagePath: '/assets/products/cascade-hops.webp',
        name: 'Cascade Hops',
        priceMinor: 699,
        priceQualifier: 'per pound',
        slug: 'cascade-hops',
        stockAmount: 0,
        teaser: 'Citrus and floral whole-cone hops.',
      },
    ]);
    rootProductFindFirst.mockResolvedValue({
      ...saleRuleValues,
      category: { name: 'Hops', slug: 'hops' },
      currency: 'USD',
      description: 'Bright whole-cone hops',
      id: 'product-id',
      imagePath: '/assets/products/cascade-hops.webp',
      name: 'Cascade Hops',
      priceMinor: 699,
      priceQualifier: 'per pound',
      slug: 'cascade-hops',
      specifications: [
        { label: 'Origin', value: 'USA' },
        { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
      ],
      stockAmount: 0,
      teaser: 'Citrus and floral whole-cone hops.',
    });
  });

  it('returns one active USD detail with ordered specifications and derived availability', async () => {
    await expect(service.getProduct('cascade-hops')).resolves.toEqual({
      ...saleRuleValues,
      availability: 'out-of-stock',
      category: { name: 'Hops', slug: 'hops' },
      currency: 'USD',
      description: 'Bright whole-cone hops',
      id: 'product-id',
      imagePath: '/assets/products/cascade-hops.webp',
      name: 'Cascade Hops',
      priceMinor: 699,
      priceQualifier: 'per pound',
      slug: 'cascade-hops',
      specifications: [
        { label: 'Origin', value: 'USA' },
        { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
      ],
      stockAmount: 0,
      teaser: 'Citrus and floral whole-cone hops.',
    });
    expect(rootProductFindFirst).toHaveBeenCalledWith({
      select: productDetailSelect,
      where: {
        currency: 'USD',
        slug: 'cascade-hops',
        ...publicLifecycleWhere,
      },
    });
  });

  it('returns the same generic not-found result for every non-public product', async () => {
    rootProductFindFirst.mockResolvedValue(null);

    await expect(service.getProduct('hidden-product')).rejects.toMatchObject({
      message: 'Product not found',
      status: 404,
    });
  });

  it.each([
    {},
    [],
    [{ label: '', value: 'USA' }],
    [{ label: 'Origin', value: [] }],
    [{ label: 'Origin', value: [1] }],
  ])(
    'fails closed when stored specifications are malformed: %j',
    async (specifications) => {
      rootProductFindFirst.mockResolvedValue({
        ...saleRuleValues,
        category: { name: 'Hops', slug: 'hops' },
        currency: 'USD',
        description: 'Bright whole-cone hops',
        id: 'product-id',
        imagePath: '/assets/products/cascade-hops.webp',
        name: 'Cascade Hops',
        priceMinor: 699,
        priceQualifier: 'per pound',
        slug: 'cascade-hops',
        specifications,
        stockAmount: 1,
        teaser: 'Citrus and floral whole-cone hops.',
      });

      await expect(service.getProduct('cascade-hops')).rejects.toThrow(
        'Stored product specifications are invalid',
      );
    },
  );

  it('uses one default where and a RepeatableRead transaction for count, items and independent facets', async () => {
    const result = await service.listProducts({
      limit: 12,
      page: 1,
      sort: 'name-asc',
    });
    const where = { currency: 'USD', ...publicLifecycleWhere };

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(findProducts).toHaveBeenCalledWith({
      orderBy: [{ name: 'asc' }, { slug: 'asc' }],
      select: productSelect,
      skip: 0,
      take: 12,
      where,
    });
    expect(findCategories).toHaveBeenCalledWith(facetQuery);
    expect(rootProductCount).not.toHaveBeenCalled();
    expect(rootProductFindMany).not.toHaveBeenCalled();
    expect(rootCategoryFindMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [
        {
          ...saleRuleValues,
          availability: 'out-of-stock',
          category: { name: 'Hops', slug: 'hops' },
          currency: 'USD',
          description: 'Bright whole-cone hops',
          id: 'product-id',
          imagePath: '/assets/products/cascade-hops.webp',
          name: 'Cascade Hops',
          priceMinor: 699,
          priceQualifier: 'per pound',
          slug: 'cascade-hops',
          stockAmount: 0,
          teaser: 'Citrus and floral whole-cone hops.',
        },
      ],
      meta: {
        currency: 'USD',
        facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
        filters: {
          category: null,
          maxPriceMinor: null,
          minPriceMinor: null,
          search: null,
        },
        hasNextPage: false,
        hasPreviousPage: false,
        limit: 12,
        page: 1,
        sort: 'name-asc',
        totalItems: 1,
        totalPages: 1,
      },
    });
  });

  it('builds token-AND/field-OR filters once and applies deterministic price paging', async () => {
    count.mockResolvedValue(5);
    findProducts.mockResolvedValue([]);
    const query = {
      category: 'hops',
      limit: 2,
      maxPriceMinor: 900,
      minPriceMinor: 100,
      page: 2,
      search: 'Café hops',
      sort: 'price-desc',
    } satisfies CatalogQueryDto;

    const result = await service.listProducts(query);
    const textFilter = (token: string) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { teaser: { contains: token, mode: 'insensitive' } },
        { description: { contains: token, mode: 'insensitive' } },
      ],
    });
    const where = {
      AND: [
        ...publicLifecycleWhere.AND,
        textFilter('Café'),
        textFilter('hops'),
      ],
      category: { slug: 'hops' },
      currency: 'USD',
      isActive: true,
      priceMinor: { gte: 100, lte: 900 },
    };

    expect(count).toHaveBeenCalledWith({ where });
    expect(findProducts).toHaveBeenCalledWith({
      orderBy: [{ priceMinor: 'desc' }, { name: 'asc' }, { slug: 'asc' }],
      select: productSelect,
      skip: 2,
      take: 2,
      where,
    });
    expect(findCategories).toHaveBeenCalledWith(facetQuery);
    expect(result.meta).toMatchObject({
      filters: {
        category: 'hops',
        maxPriceMinor: 900,
        minPriceMinor: 100,
        search: 'Café hops',
      },
      hasNextPage: true,
      hasPreviousPage: true,
      page: 2,
      totalItems: 5,
      totalPages: 3,
    });
  });

  it.each([
    ['name-asc', [{ name: 'asc' }, { slug: 'asc' }]],
    ['name-desc', [{ name: 'desc' }, { slug: 'asc' }]],
    ['price-asc', [{ priceMinor: 'asc' }, { name: 'asc' }, { slug: 'asc' }]],
    ['price-desc', [{ priceMinor: 'desc' }, { name: 'asc' }, { slug: 'asc' }]],
  ] as const)('uses exact stable order for %s', async (sort, orderBy) => {
    await service.listProducts({ limit: 12, page: 1, sort });

    expect(findProducts).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy }),
    );
  });

  it('returns empty-page metadata without clamping the requested page', async () => {
    count.mockResolvedValue(0);
    findProducts.mockResolvedValue([]);

    const result = await service.listProducts({
      category: 'valid-but-unknown',
      limit: 12,
      page: 7,
      sort: 'name-asc',
    });

    expect(result.items).toEqual([]);
    expect(result.meta).toMatchObject({
      hasNextPage: false,
      hasPreviousPage: false,
      page: 7,
      totalItems: 0,
      totalPages: 0,
    });
    expect(findCategories).toHaveBeenCalledWith(facetQuery);
  });

  it.each([
    [{ minPriceMinor: 100 }, { gte: 100 }],
    [{ maxPriceMinor: 900 }, { lte: 900 }],
  ] as const)('applies a one-sided price bound', async (bound, priceMinor) => {
    await service.listProducts({
      ...bound,
      limit: 12,
      page: 1,
      sort: 'name-asc',
    });

    expect(count).toHaveBeenCalledWith({
      where: { currency: 'USD', ...publicLifecycleWhere, priceMinor },
    });
  });

  it('keeps an out-of-range page when matching rows exist', async () => {
    count.mockResolvedValue(5);
    findProducts.mockResolvedValue([]);

    const result = await service.listProducts({
      limit: 2,
      page: 7,
      sort: 'name-asc',
    });

    expect(result.meta).toMatchObject({
      hasNextPage: false,
      hasPreviousPage: true,
      page: 7,
      totalItems: 5,
      totalPages: 3,
    });
  });

  it.each([
    [48, 9_601],
    [1, 201],
  ])(
    'caps the navigable window at page 200 for limit %i and total %i',
    async (limit, totalItems) => {
      count.mockResolvedValue(totalItems);
      findProducts.mockResolvedValue([]);

      const result = await service.listProducts({
        limit,
        page: 200,
        sort: 'name-asc',
      });

      expect(result.meta).toMatchObject({
        hasNextPage: false,
        hasPreviousPage: true,
        limit,
        page: 200,
        totalItems,
        totalPages: 200,
      });
    },
  );
});
