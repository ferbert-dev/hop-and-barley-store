import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { ProductAssetStorageService } from '../product-assets/product-asset-storage.service';
import {
  AdminProductCreationService,
  createProductSlug,
} from './admin-product-creation.service';
import type { AdminCreateProductBodyDto } from './dto/admin-product-create.dto';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const STORED_ASSET = {
  imagePath:
    '/product-assets/7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp' as const,
  key: '7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp' as const,
};
const IMAGE = {
  buffer: Buffer.from('image'),
  mimetype: 'image/png',
  size: 5,
};

const baseDto = {
  categoryId: CATEGORY_ID,
  description: 'Bright citrus aroma for pale ales.',
  isActive: 'true',
  name: 'Café Hops',
  price: '5.99',
  saleKind: 'WEIGHT',
  stockAmount: '100000000',
} satisfies AdminCreateProductBodyDto;

describe('AdminProductCreationService', () => {
  const create = jest.fn<
    Promise<Record<string, unknown>>,
    [
      Readonly<{
        data: Record<string, unknown>;
        select: Record<string, unknown>;
      }>,
    ]
  >();
  const deleteAsset = jest.fn();
  const storeImage = jest.fn();
  let service: AdminProductCreationService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminProductCreationService,
        { provide: PrismaService, useValue: { product: { create } } },
        {
          provide: ProductAssetStorageService,
          useValue: { deleteAsset, storeImage },
        },
      ],
    }).compile();

    service = moduleRef.get(AdminProductCreationService);
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-28T15:00:00.000Z'));
    storeImage.mockResolvedValue(STORED_ASSET);
    create.mockResolvedValue({
      activeFrom: new Date('2026-08-28T15:00:00.000Z'),
      activeUntil: null,
      amountUnit: 'MILLIGRAM',
      category: { id: CATEGORY_ID, name: 'Hops', slug: 'hops' },
      createdAt: new Date('2026-08-28T15:00:00.000Z'),
      currency: 'USD',
      description: baseDto.description,
      id: '30000000-0000-4000-8000-000000000001',
      imagePath: STORED_ASSET.imagePath,
      isActive: true,
      maximumOrderAmount: 100_000_000,
      minimumOrderAmount: 100_000,
      name: baseDto.name,
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceMinor: 599,
      priceQualifier: 'per 100g',
      saleKind: 'WEIGHT',
      slug: 'cafe-hops',
      stockAmount: 100_000_000,
      teaser: baseDto.description,
      updatedAt: new Date('2026-08-28T15:00:00.000Z'),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns exactly the four ordered C1A categories and two sale kinds', () => {
    expect(service.getCreateOptions()).toEqual({
      categories: [
        { id: CATEGORY_ID, name: 'Hops', slug: 'hops' },
        {
          id: '10000000-0000-4000-8000-000000000002',
          name: 'Malt',
          slug: 'malts',
        },
        {
          id: '10000000-0000-4000-8000-000000000003',
          name: 'Yeast',
          slug: 'yeast',
        },
        {
          id: '10000000-0000-4000-8000-000000000004',
          name: 'Adjuncts',
          slug: 'adjuncts',
        },
      ],
      saleKinds: ['WEIGHT', 'PACKAGE'],
    });
  });

  it('derives the bounded WEIGHT contract, USD price and product type specification', async () => {
    const result = await service.createProduct(baseDto, IMAGE);

    expect(storeImage).toHaveBeenCalledWith(IMAGE);
    expect(create).toHaveBeenCalledTimes(1);
    const request = create.mock.calls[0]?.[0];
    expect(request?.data).toEqual({
      activeFrom: new Date('2026-08-28T15:00:00.000Z'),
      activeUntil: null,
      amountUnit: 'MILLIGRAM',
      category: { connect: { id: CATEGORY_ID } },
      currency: 'USD',
      description: baseDto.description,
      imagePath: STORED_ASSET.imagePath,
      isActive: true,
      kitYieldVolumeMl: null,
      maximumOrderAmount: 100_000_000,
      minimumOrderAmount: 100_000,
      name: baseDto.name,
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceMinor: 599,
      priceQualifier: 'per 100g',
      saleKind: 'WEIGHT',
      slug: 'cafe-hops',
      specifications: [{ label: 'Product Type', value: 'Hops' }],
      stockAmount: 100_000_000,
      teaser: 'Bright citrus aroma for pale ales.',
    });
    expect(request?.select).toMatchObject({
      category: { select: { id: true, name: true, slug: true } },
      imagePath: true,
    });
    expect(result).toMatchObject({
      activeFrom: new Date('2026-08-28T15:00:00.000Z'),
      currency: 'USD',
      imagePath: STORED_ASSET.imagePath,
      priceMinor: 599,
      priceQualifier: 'per 100g',
      specifications: [{ label: 'Product Type', value: 'Hops' }],
    });
    expect(deleteAsset).not.toHaveBeenCalled();
  });

  it('derives the PACKAGE contract and accepts an optional positive net weight', async () => {
    create.mockResolvedValueOnce({
      ...createResolvedProduct(),
      amountUnit: 'EACH',
      maximumOrderAmount: null,
      minimumOrderAmount: 1,
      orderStepAmount: 1,
      packageNetWeightMg: 11_500,
      priceBasisAmount: 1,
      priceQualifier: 'per package',
      saleKind: 'PACKAGE',
    });

    await service.createProduct(
      {
        ...baseDto,
        isActive: 'false',
        packageNetWeightMg: '11500',
        saleKind: 'PACKAGE',
      },
      IMAGE,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      amountUnit: 'EACH',
      isActive: false,
      maximumOrderAmount: null,
      minimumOrderAmount: 1,
      orderStepAmount: 1,
      packageNetWeightMg: 11_500,
      priceBasisAmount: 1,
      priceQualifier: 'per package',
    });
  });

  it.each([
    [
      'category',
      { ...baseDto, categoryId: '10000000-0000-4000-8000-000000000005' },
    ],
    ['price', { ...baseDto, price: '0.00' }],
    ['price', { ...baseDto, price: '21474836.48' }],
    ['stock', { ...baseDto, stockAmount: '2000000001' }],
    ['weight metadata', { ...baseDto, packageNetWeightMg: '100000' }],
    [
      'activity window',
      {
        ...baseDto,
        activeFrom: '2026-08-29T00:00:00.000Z',
        activeUntil: '2026-08-28T00:00:00.000Z',
      },
    ],
  ] as const)(
    'rejects invalid %s input before storing an asset',
    async (_label, dto) => {
      await expect(
        service.createProduct(dto as AdminCreateProductBodyDto, IMAGE),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storeImage).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('removes the stored asset and returns 409 on a generated slug conflict', async () => {
    create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['slug'] } });

    await expect(service.createProduct(baseDto, IMAGE)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteAsset).toHaveBeenCalledWith(STORED_ASSET.key);
  });

  it('removes the stored asset and fails closed on another database error', async () => {
    create.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.createProduct(baseDto, IMAGE)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(deleteAsset).toHaveBeenCalledWith(STORED_ASSET.key);
  });
});

describe('createProductSlug', () => {
  it('creates a bounded lowercase ASCII slug and never ends with a separator', () => {
    expect(createProductSlug('  Café & Fresh Hops  ')).toBe('cafe-fresh-hops');
    expect(createProductSlug('Пиво')).toBe('product');
    expect(createProductSlug(`${'a'.repeat(63)} tail`)).toMatch(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    );
    expect(createProductSlug(`${'a'.repeat(63)} tail`)).toHaveLength(63);
  });
});

function createResolvedProduct() {
  return {
    activeFrom: new Date('2026-08-28T15:00:00.000Z'),
    activeUntil: null,
    category: { id: CATEGORY_ID, name: 'Hops', slug: 'hops' },
    createdAt: new Date('2026-08-28T15:00:00.000Z'),
    currency: 'USD',
    description: baseDto.description,
    id: '30000000-0000-4000-8000-000000000001',
    imagePath: STORED_ASSET.imagePath,
    isActive: false,
    name: baseDto.name,
    priceMinor: 599,
    slug: 'cafe-hops',
    stockAmount: 100_000_000,
    teaser: baseDto.description,
    updatedAt: new Date('2026-08-28T15:00:00.000Z'),
  };
}
