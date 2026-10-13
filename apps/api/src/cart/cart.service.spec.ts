import { PrismaService } from '../database/prisma.service';
import type { ActiveCartCapability } from './cart-request';
import { CartService } from './cart.service';
import { hashCartToken } from './cart-token';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const cartId = '30000000-0000-4000-8000-000000000001';
const itemId = '40000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000002';
const now = new Date('2026-08-27T12:00:00.000Z');
const capability: ActiveCartCapability = {
  cartId,
  expiresAt: new Date('2026-09-21T00:00:00.000Z'),
  rawToken: 'A'.repeat(43),
};

describe('CartService desired-amount cart', () => {
  it('returns a public empty cart without reservation-derived fields', () => {
    const cart = new CartService({} as PrismaService).empty();
    expect(cart).toEqual({
      currency: 'EUR',
      distinctItemCount: 0,
      items: [],
      subtotalMinor: 0,
    });
    expect(JSON.stringify(cart)).not.toMatch(
      /reservation|checkoutEligible|serverNow|availability/i,
    );
  });

  it('creates a desired line above current stock without minting a reservation', async () => {
    const transaction = transactionMock();
    transaction.product.findUnique.mockResolvedValue(
      product({ stockAmount: 0 }),
    );
    transaction.cart.create.mockResolvedValue({ id: cartId });
    transaction.cartItem.create.mockResolvedValue({ id: itemId });
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart([{ amount: 5, product: product({ stockAmount: 0 }) }]),
    );

    const created = await new CartService(prismaMock(transaction)).createAndAdd(
      { productSlug: 'fixture-product', amount: 5 },
      now,
    );

    expect(transaction.cartItem.create).toHaveBeenCalledWith({
      data: { amount: 5, cartId, productId },
    });
    expect(created.cart.items[0]).toMatchObject({
      amount: 5,
      productSlug: 'fixture-product',
      stockAmount: 0,
    });
    expect(transaction).not.toHaveProperty('cartReservation');
  });

  it('updates a desired line without using stock as a ceiling', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw.mockResolvedValue([
      { expiresAt: capability.expiresAt, hasOrder: false, id: cartId },
    ]);
    transaction.cartItem.findFirst.mockResolvedValue({
      id: itemId,
      product: product({ stockAmount: 1 }),
    });
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart([{ amount: 10, product: product({ stockAmount: 1 }) }]),
    );

    const cart = await new CartService(prismaMock(transaction)).update(
      capability,
      'fixture-product',
      { amount: 10 },
      now,
    );

    expect(transaction.cartItem.update).toHaveBeenCalledWith({
      data: { amount: 10 },
      where: { id: itemId },
    });
    expect(cart.items[0]).toMatchObject({ amount: 10, stockAmount: 1 });
  });

  it('rebinds a completed Stripe guest capability to a fresh cart before adding', async () => {
    const transaction = transactionMock();
    const suppliedDigest = hashCartToken(capability.rawToken);
    transaction.$queryRaw.mockResolvedValue([
      {
        expiresAt: capability.expiresAt,
        id: cartId,
        tokenDigest: suppliedDigest,
        userId: null,
      },
    ]);
    transaction.order.findMany.mockResolvedValue([completedStripeOrder()]);
    transaction.cartItem.findMany.mockResolvedValue([]);
    transaction.cart.create.mockResolvedValue({ id: 'replacement-cart' });
    transaction.product.findUnique.mockResolvedValue(product());
    transaction.cartItem.findUnique.mockResolvedValue(null);
    transaction.cartItem.count.mockResolvedValue(0);
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart([{ amount: 2, product: product() }]),
    );

    await expect(
      new CartService(prismaMock(transaction)).add(
        capability,
        { amount: 2, productSlug: 'fixture-product' },
        now,
      ),
    ).resolves.toMatchObject({ items: [{ amount: 2 }] });

    expect(transaction.cart.update).toHaveBeenCalledWith({
      data: { tokenDigest: expect.any(Uint8Array) as Uint8Array },
      where: { id: cartId },
    });
    expect(transaction.cart.create).toHaveBeenCalledWith({
      data: {
        expiresAt: capability.expiresAt,
        tokenDigest: expect.any(Uint8Array) as Uint8Array,
      },
      select: { id: true },
    });
    const replacementCalls = transaction.cart.create.mock.calls as Array<
      [{ data: { tokenDigest: Uint8Array } }]
    >;
    const replacementDigest = replacementCalls[0][0].data.tokenDigest;
    expect(Buffer.from(replacementDigest)).toEqual(suppliedDigest);
    expect(transaction.cartItem.create).toHaveBeenCalledWith({
      data: {
        amount: 2,
        cartId: 'replacement-cart',
        productId,
      },
    });
  });

  it('keeps a guest cart locked while its Stripe order is not successfully captured', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw.mockResolvedValue([
      {
        expiresAt: capability.expiresAt,
        id: cartId,
        tokenDigest: hashCartToken(capability.rawToken),
        userId: null,
      },
    ]);
    transaction.order.findMany.mockResolvedValue([
      {
        paymentAttempt: {
          allocation: { status: 'RECONCILIATION_REQUIRED' },
          status: 'RECONCILIATION_REQUIRED',
        },
        paymentMethod: 'STRIPE_DEBIT_CARD',
        paymentState: 'PENDING',
        status: 'PLACED',
      },
    ]);

    await expect(
      new CartService(prismaMock(transaction)).add(
        capability,
        { amount: 2, productSlug: 'fixture-product' },
        now,
      ),
    ).rejects.toMatchObject({ response: { status: 'unavailable' } });
    expect(transaction.cart.update).not.toHaveBeenCalled();
    expect(transaction.cart.create).not.toHaveBeenCalled();
  });

  it('follows an already-rebound guest capability without creating a second cart', async () => {
    const transaction = transactionMock();
    transaction.$queryRaw
      .mockResolvedValueOnce([
        {
          expiresAt: capability.expiresAt,
          id: cartId,
          tokenDigest: hashCartToken('archived-capability'),
          userId: null,
        },
      ])
      .mockResolvedValueOnce([
        { expiresAt: capability.expiresAt, id: 'replacement-cart' },
      ]);
    transaction.order.findMany.mockResolvedValue([completedStripeOrder()]);
    transaction.order.count.mockResolvedValue(0);
    transaction.product.findUnique.mockResolvedValue(product());
    transaction.cartItem.findUnique.mockResolvedValue({ amount: 2 });
    transaction.cart.findUniqueOrThrow.mockResolvedValue(
      storedCart([{ amount: 4, product: product() }]),
    );

    await expect(
      new CartService(prismaMock(transaction)).add(
        capability,
        { amount: 2, productSlug: 'fixture-product' },
        now,
      ),
    ).resolves.toMatchObject({ items: [{ amount: 4 }] });

    expect(transaction.cart.create).not.toHaveBeenCalled();
    expect(transaction.cartItem.update).toHaveBeenCalledWith({
      data: { amount: 4 },
      where: {
        cartId_productId: {
          cartId: 'replacement-cart',
          productId,
        },
      },
    });
  });

  it('returns every safe checkout-readiness outcome without exact stock', async () => {
    const transaction = transactionMock();
    transaction.cart.findFirst.mockResolvedValue(
      storedCart([
        { amount: 1, product: product({ slug: 'available', stockAmount: 1 }) },
        {
          amount: 2,
          product: product({ slug: 'short', stockAmount: 1 }),
        },
        {
          amount: 1,
          product: product({ isActive: false, slug: 'hidden' }),
        },
        {
          amount: 2,
          product: product({
            minimumOrderAmount: 1,
            orderStepAmount: 2,
            slug: 'invalid',
          }),
        },
        {
          amount: 2_000_000_000,
          product: product({
            priceBasisAmount: 1,
            priceMinor: 2_147_483_647,
            slug: 'price-overflow',
            stockAmount: 2_000_000_000,
          }),
        },
      ]),
    );

    const readiness = await new CartService(
      prismaMock(transaction),
    ).checkoutReadiness(capability, now);

    expect(readiness).toEqual({
      checkedAt: now.toISOString(),
      lines: [
        { outcome: 'available', productSlug: 'available', requestedAmount: 1 },
        {
          outcome: 'insufficient_stock',
          productSlug: 'short',
          requestedAmount: 2,
        },
        {
          outcome: 'product_unavailable',
          productSlug: 'hidden',
          requestedAmount: 1,
        },
        {
          outcome: 'invalid_amount',
          productSlug: 'invalid',
          requestedAmount: 2,
        },
        {
          outcome: 'price_unavailable',
          productSlug: 'price-overflow',
          requestedAmount: 2_000_000_000,
        },
      ],
      status: 'unavailable',
    });
    expect(JSON.stringify(readiness)).not.toMatch(
      /stockAmount|productId|reservation|supplier|provider/i,
    );
  });
});

function product(overrides: Record<string, unknown> = {}) {
  return {
    activeFrom: null,
    activeUntil: null,
    amountUnit: 'EACH',
    currency: 'EUR',
    id: productId,
    imagePath: '/assets/products/fixture.webp',
    isActive: true,
    kitYieldVolumeMl: null,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    name: 'Fixture Product',
    orderStepAmount: 1,
    packageNetWeightMg: null,
    priceBasisAmount: 1,
    priceMinor: 500,
    priceQualifier: 'per fixture',
    saleKind: 'PACKAGE',
    slug: 'fixture-product',
    stockAmount: 100,
    ...overrides,
  };
}

function storedCart(
  items: ReadonlyArray<{
    amount: number;
    product: ReturnType<typeof product>;
  }>,
) {
  return { items };
}

function completedStripeOrder() {
  return {
    paymentAttempt: {
      allocation: { status: 'CAPTURED' },
      status: 'SUCCEEDED',
    },
    paymentMethod: 'STRIPE_DEBIT_CARD',
    paymentState: 'PAID',
    status: 'PAID',
  };
}

function prismaMock(transaction: ReturnType<typeof transactionMock>) {
  return {
    $transaction: jest.fn(
      (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
    cart: transaction.cart,
  } as unknown as PrismaService;
}

function transactionMock() {
  return {
    $queryRaw: jest.fn(),
    cart: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
  };
}
