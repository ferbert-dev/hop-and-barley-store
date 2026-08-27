import { PrismaService } from '../database/prisma.service';
import type { ActiveCartCapability } from './cart-request';
import { CartService } from './cart.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const cartId = '30000000-0000-4000-8000-000000000001';
const itemId = '40000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000002';
const reservationId = '50000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-25T12:00:00.000Z');
const expiresAt = new Date('2026-08-25T12:15:00.000Z');

const capability: ActiveCartCapability = {
  cartId,
  expiresAt: new Date('2026-09-21T00:00:00.000Z'),
  rawToken: 'A'.repeat(43),
};

describe('CartService reservation invariants', () => {
  it('returns server time and canonical empty reservation response fields', () => {
    expect(new CartService({} as PrismaService).empty(now)).toEqual({
      adjustmentMessage: null,
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
      serverNow: '2026-08-25T12:00:00.000Z',
      subtotalMinor: 0,
    });
  });

  it('uses the exact expiry boundary and never leaks reservation identity', async () => {
    const prisma = {
      cart: {
        findFirst: jest.fn().mockResolvedValue(
          storedCart(2, {
            expiresAt,
            amount: 2,
            status: 'ACTIVE',
          }),
        ),
      },
    } as unknown as PrismaService;
    const service = new CartService(prisma);

    const active = await service.getCart(
      capability,
      new Date('2026-08-25T12:14:59.999Z'),
    );
    const expired = await service.getCart(capability, expiresAt);

    expect(active.items[0]).toMatchObject({
      availability: 'available',
      reservationExpiresAt: expiresAt.toISOString(),
      reservationStatus: 'active',
    });
    expect(expired.items[0]).toMatchObject({
      availability: 'unavailable',
      reservationExpiresAt: expiresAt.toISOString(),
      reservationStatus: 'expired',
    });
    expect(JSON.stringify(expired)).not.toMatch(
      /cartId|reservationId|token|digest/i,
    );
  });

  it('creates a first-line reservation for exactly 15 minutes from the supplied server clock', async () => {
    const transaction = transactionMock();
    transaction.product.findUnique.mockResolvedValue({ id: productId });
    transaction.product.findUniqueOrThrow.mockResolvedValue(product());
    transaction.$queryRaw.mockResolvedValue([{ id: productId }]);
    transaction.cartReservation.findMany.mockResolvedValue([]);
    transaction.cart.create.mockResolvedValue({ id: cartId });
    transaction.cartItem.create.mockResolvedValue({ id: itemId });
    transaction.cartReservation.create.mockResolvedValue({
      id: reservationId,
    });
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart(2, { expiresAt, amount: 2, status: 'ACTIVE' }),
    );
    const service = new CartService(prismaMock(transaction));

    const created = await service.createAndAdd(
      { productSlug: 'cascade-hops', amount: 2 },
      now,
    );

    expect(transaction.cartReservation.create).toHaveBeenCalledWith({
      data: {
        cartId,
        cartItemId: itemId,
        expiresAt,
        productId,
        amount: 2,
        reservedAt: now,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(transaction.cartItem.update).toHaveBeenCalledWith({
      data: { currentReservationId: reservationId },
      where: { id: itemId },
    });
    expect(created.cart.serverNow).toBe(now.toISOString());
    expect(created.cart.items[0].reservationStatus).toBe('active');
  });

  it('decreases the held amount without changing the reservation clock', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw
      .mockResolvedValueOnce([{ expiresAt: capability.expiresAt, id: cartId }])
      .mockResolvedValueOnce([{ id: productId }]);
    transaction.cartItem.findFirst.mockResolvedValue({ id: itemId, productId });
    transaction.cartItem.findUniqueOrThrow.mockResolvedValue({
      currentReservation: {
        expiresAt,
        id: reservationId,
        amount: 4,
        status: 'ACTIVE',
      },
      id: itemId,
      product: product(),
      amount: 4,
    });
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart(2, { expiresAt, amount: 2, status: 'ACTIVE' }),
    );
    const service = new CartService(prismaMock(transaction));

    const cart = await service.update(
      capability,
      'cascade-hops',
      { amount: 2 },
      now,
    );

    expect(transaction.cartReservation.update).toHaveBeenCalledWith({
      data: { amount: 2 },
      where: { id: reservationId },
    });
    expect(transaction.cartReservation.create).not.toHaveBeenCalled();
    expect(cart.items[0].reservationExpiresAt).toBe(expiresAt.toISOString());
  });

  it('renews only an increased line with a fresh identity and exact new expiry', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw
      .mockResolvedValueOnce([{ expiresAt: capability.expiresAt, id: cartId }])
      .mockResolvedValueOnce([{ id: productId }]);
    transaction.cartItem.findFirst.mockResolvedValue({ id: itemId, productId });
    transaction.cartItem.findUniqueOrThrow.mockResolvedValue({
      currentReservation: {
        expiresAt,
        id: reservationId,
        amount: 2,
        status: 'ACTIVE',
      },
      id: itemId,
      product: product(),
      amount: 2,
    });
    transaction.cartReservation.findMany.mockResolvedValue([]);
    transaction.cartReservation.create.mockResolvedValue({
      id: '50000000-0000-4000-8000-000000000002',
    });
    const renewedAt = new Date('2026-08-25T12:05:00.000Z');
    const renewedExpiry = new Date('2026-08-25T12:20:00.000Z');
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart(4, {
        expiresAt: renewedExpiry,
        amount: 4,
        status: 'ACTIVE',
      }),
    );
    const service = new CartService(prismaMock(transaction));

    const cart = await service.update(
      capability,
      'cascade-hops',
      { amount: 4 },
      renewedAt,
    );

    expect(transaction.cartReservation.updateMany).toHaveBeenLastCalledWith({
      data: { releasedAt: renewedAt, status: 'RELEASED' },
      where: {
        cartId,
        cartItemId: { in: [itemId] },
        status: 'ACTIVE',
      },
    });
    expect(transaction.cartReservation.create).toHaveBeenCalledWith({
      data: {
        cartId,
        cartItemId: itemId,
        expiresAt: renewedExpiry,
        productId,
        amount: 4,
        reservedAt: renewedAt,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    expect(cart.items[0].reservationExpiresAt).toBe(
      renewedExpiry.toISOString(),
    );
  });
});

function product() {
  return {
    currency: 'USD',
    id: productId,
    isActive: true,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    orderStepAmount: 1,
    stockAmount: 10,
  };
}

function storedCart(
  amount: number,
  currentReservation: {
    expiresAt: Date;
    amount: number;
    status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'RELEASED';
  } | null,
) {
  return {
    items: [
      {
        currentReservation,
        product: {
          amountUnit: 'EACH',
          currency: 'USD',
          id: productId,
          imagePath: '/assets/products/cascade-hops.webp',
          isActive: true,
          kitYieldVolumeMl: null,
          maximumOrderAmount: null,
          minimumOrderAmount: 1,
          name: 'Cascade Hops',
          orderStepAmount: 1,
          packageNetWeightMg: null,
          priceBasisAmount: 1,
          priceMinor: 699,
          priceQualifier: 'per pound',
          saleKind: 'PACKAGE',
          slug: 'cascade-hops',
          stockAmount: 10,
        },
        amount,
      },
    ],
  };
}

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
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cartReservation: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}
