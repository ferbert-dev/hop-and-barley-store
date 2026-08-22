import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ActiveCartCapability } from './cart-request';
import { CartService } from './cart.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const capability: ActiveCartCapability = {
  cartId: '30000000-0000-4000-8000-000000000001',
  expiresAt: new Date('2026-09-21T00:00:00.000Z'),
  rawToken: 'A'.repeat(43),
};

const storedCart = (stockQuantity = 10, priceMinor = 699) => ({
  items: [
    {
      product: {
        currency: 'USD',
        id: '20000000-0000-4000-8000-000000000002',
        imagePath: '/assets/products/cascade-hops.webp',
        isActive: true,
        name: 'Cascade Hops',
        priceMinor,
        priceQualifier: 'per pound',
        slug: 'cascade-hops',
        stockQuantity,
      },
      quantity: 2,
    },
  ],
});

describe('CartService server-owned invariants', () => {
  it('validates active USD stock before first-cart persistence and stores only a digest', async () => {
    const transaction = transactionMock();
    transaction.product.findFirst.mockResolvedValue({
      id: '20000000-0000-4000-8000-000000000002',
      stockQuantity: 10,
    });
    let persisted:
      { tokenDigest: Uint8Array; [key: string]: unknown } | undefined;
    transaction.cart.create.mockImplementation(
      (args: { data: { tokenDigest: Uint8Array; [key: string]: unknown } }) => {
        persisted = args.data;
        return Promise.resolve({ id: capability.cartId });
      },
    );
    transaction.cart.findUniqueOrThrow.mockResolvedValue(storedCart());
    const service = new CartService(prismaMock(transaction));

    const created = await service.createAndAdd(
      { productSlug: 'cascade-hops', quantity: 2 },
      new Date('2026-08-22T00:00:00.000Z'),
    );

    expect(transaction.product.findFirst).toHaveBeenCalledWith({
      select: { id: true, stockQuantity: true },
      where: {
        currency: 'USD',
        isActive: true,
        slug: 'cascade-hops',
        stockQuantity: { gte: 2 },
      },
    });
    expect(persisted).toBeDefined();
    if (!persisted) throw new Error('Expected persisted cart data');
    expect(persisted.tokenDigest).toBeInstanceOf(Uint8Array);
    expect(persisted.tokenDigest).toHaveLength(32);
    expect(JSON.stringify(persisted)).not.toContain(created.rawToken);
    expect(created.cart.subtotalMinor).toBe(1398);
  });

  it('does not create a cart for inactive, non-USD or insufficient-stock products', async () => {
    const transaction = transactionMock();
    transaction.product.findFirst.mockResolvedValue(null);
    const service = new CartService(prismaMock(transaction));

    await expect(
      service.createAndAdd({ productSlug: 'not-available', quantity: 2 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.cart.create).not.toHaveBeenCalled();
  });

  it('enforces the 50-distinct-line limit inside the locked transaction', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw.mockResolvedValue([{ id: capability.cartId }]);
    transaction.product.findFirst.mockResolvedValue({
      id: '20000000-0000-4000-8000-000000000003',
      stockQuantity: 10,
    });
    transaction.cartItem.findUnique.mockResolvedValue(null);
    transaction.cartItem.count.mockResolvedValue(50);
    const service = new CartService(prismaMock(transaction));

    await expect(
      service.add(capability, { productSlug: 'citra-hops', quantity: 1 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.cartItem.create).not.toHaveBeenCalled();
  });

  it('recomputes current price, totals and checkout eligibility without exact stock', async () => {
    const prisma = {
      cart: { findFirst: jest.fn().mockResolvedValue(storedCart(1, 725)) },
    } as unknown as PrismaService;
    const result = await new CartService(prisma).getCart(capability);

    expect(result).toMatchObject({
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 1,
      subtotalMinor: 1450,
      totalQuantity: 2,
    });
    expect(result.items[0]).toMatchObject({
      availability: 'unavailable',
      currentUnitPriceMinor: 725,
      lineTotalMinor: 1450,
      quantity: 2,
    });
    expect(JSON.stringify(result)).not.toMatch(/stock|cartId|token|digest/i);
  });
});

function prismaMock(transaction: ReturnType<typeof transactionMock>) {
  return {
    $transaction: jest.fn(
      (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  } as unknown as PrismaService;
}

function transactionMock() {
  return {
    $queryRaw: jest.fn(),
    cart: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    cartItem: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    product: { findFirst: jest.fn() },
  };
}
