import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import {
  AdminProductListService,
  resolveAdminProductLifecycle,
} from './admin-product-list.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

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
};

describe('AdminProductListService', () => {
  const count = jest.fn();
  const findCategories = jest.fn();
  const findProducts = jest.fn();
  const transaction = jest.fn();
  const transactionClient = {
    category: { findMany: findCategories },
    product: { count, findMany: findProducts },
  };
  let service: AdminProductListService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminProductListService,
        {
          provide: PrismaService,
          useValue: { $transaction: transaction },
        },
      ],
    }).compile();

    service = moduleRef.get(AdminProductListService);
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    transaction.mockImplementation(
      (callback: (client: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
    count.mockResolvedValue(1);
    findCategories.mockResolvedValue([{ name: 'Hops', slug: 'hops' }]);
    findProducts.mockResolvedValue([
      {
        activeFrom: new Date('2026-08-29T12:00:00.000Z'),
        activeUntil: null,
        amountUnit: 'MILLIGRAM',
        category: { name: 'Hops', slug: 'hops' },
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        currency: 'USD',
        description: 'Bright whole-cone hops',
        id: 'product-id',
        isActive: true,
        name: 'Cascade Hops',
        priceMinor: 699,
        priceQualifier: 'per 100g',
        saleKind: 'WEIGHT',
        slug: 'cascade-hops',
        stockAmount: 100_000_000,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('omits only the public isActive predicate and reads count, items and facets in one repeatable snapshot', async () => {
    const result = await service.listProducts({
      category: 'hops',
      limit: 2,
      maxPriceMinor: 900,
      minPriceMinor: 100,
      page: 2,
      search: 'Café hops',
      sort: 'price-desc',
    });
    const textFilter = (token: string) => ({
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { teaser: { contains: token, mode: 'insensitive' } },
        { description: { contains: token, mode: 'insensitive' } },
      ],
    });
    const where = {
      AND: [textFilter('Café'), textFilter('hops')],
      category: { slug: 'hops' },
      currency: 'USD',
      priceMinor: { gte: 100, lte: 900 },
    };

    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(count).toHaveBeenCalledWith({ where });
    expect(findProducts).toHaveBeenCalledWith({
      orderBy: [{ priceMinor: 'desc' }, { name: 'asc' }, { slug: 'asc' }],
      select: adminProductSelect,
      skip: 2,
      take: 2,
      where,
    });
    expect(findCategories).toHaveBeenCalledWith({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { slug: 'asc' }],
      select: { name: true, slug: true },
      where: { products: { some: { currency: 'USD' } } },
    });
    expect(result.items[0]).toMatchObject({
      lifecycleStatus: 'SCHEDULED',
      slug: 'cascade-hops',
    });
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual([
      'activeFrom',
      'activeUntil',
      'amountUnit',
      'category',
      'createdAt',
      'currency',
      'description',
      'id',
      'isActive',
      'lifecycleStatus',
      'name',
      'priceMinor',
      'priceQualifier',
      'saleKind',
      'slug',
      'stockAmount',
      'updatedAt',
    ]);
    expect(result.meta).toMatchObject({
      facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
      filters: {
        category: 'hops',
        maxPriceMinor: 900,
        minPriceMinor: 100,
        search: 'Café hops',
      },
      hasNextPage: false,
      hasPreviousPage: true,
      totalItems: 1,
      totalPages: 1,
    });
  });

  it.each([
    [false, '2026-08-27T00:00:00.000Z', '2026-08-28T12:00:00.000Z', 'DISABLED'],
    [true, '2026-08-29T00:00:00.000Z', '2026-08-30T00:00:00.000Z', 'SCHEDULED'],
    [true, '2026-08-27T00:00:00.000Z', '2026-08-28T12:00:00.000Z', 'EXPIRED'],
    [true, '2026-08-28T12:00:00.000Z', null, 'ACTIVE'],
    [true, null, null, 'ACTIVE'],
  ] as const)(
    'uses lifecycle precedence for enabled=%s from=%s until=%s',
    (isActive, activeFrom, activeUntil, expected) => {
      expect(
        resolveAdminProductLifecycle(
          {
            activeFrom: activeFrom ? new Date(activeFrom) : null,
            activeUntil: activeUntil ? new Date(activeUntil) : null,
            isActive,
          },
          new Date('2026-08-28T12:00:00.000Z'),
        ),
      ).toBe(expected);
    },
  );
});
