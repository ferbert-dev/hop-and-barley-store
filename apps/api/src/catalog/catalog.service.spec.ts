import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { CatalogService } from './catalog.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('CatalogService', () => {
  const findMany = jest.fn();
  let service: CatalogService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        {
          provide: PrismaService,
          useValue: { product: { findMany } },
        },
      ],
    }).compile();

    service = moduleRef.get(CatalogService);
    findMany.mockReset();
  });

  it.each([
    { label: 'empty catalog', products: [] },
    {
      label: 'seeded catalog',
      products: [
        {
          currency: 'EUR',
          description: 'A crisp local lager',
          id: 'lager-id',
          name: 'House Lager',
          priceMinor: 499,
          slug: 'house-lager',
        },
      ],
    },
  ])('returns the $label', async ({ products }) => {
    findMany.mockResolvedValue(products);

    await expect(service.listProducts()).resolves.toEqual(products);
  });
});
