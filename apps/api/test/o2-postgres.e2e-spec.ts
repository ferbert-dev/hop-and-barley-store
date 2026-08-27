import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/database/prisma.service';
import { CheckoutPaymentMethod } from '../src/orders/dto/create-order.dto';
import { OrdersService } from '../src/orders/orders.service';

const describePostgres =
  process.env.RUN_O2_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;
const productSlug = 'safale-us05-yeast';
const now = new Date(Math.floor(Date.now() / 1_000) * 1_000);

describePostgres('O2S atomic orders with disposable PostgreSQL', () => {
  let carts: CartService;
  let orders: OrdersService;
  let postgres: Client;
  let prisma: PrismaService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = module.get(PrismaService);
    carts = module.get(CartService);
    orders = module.get(OrdersService);
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.user.deleteMany();
    await prisma.product.update({
      data: { isActive: true, priceMinor: 499, stockAmount: 100 },
      where: { slug: productSlug },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.end();
  });

  it('allocates current stock once and replays before touching an empty cart', async () => {
    const userId = await createUser('cod@example.com');
    const checkout = checkoutBody(2);
    const cart = await desiredCart(2);
    const before = await productStock();
    const context = {
      cartId: cart.cartId,
      idempotencyKey: 'cod-order-0001',
      userId,
    };

    const created = await orders.create(context, checkout, now);
    const replayed = await orders.create(
      context,
      checkout,
      new Date(now.getTime() + 60_000),
    );

    expect(replayed).toEqual(created);
    expect(created).toMatchObject({
      itemSubtotalMinor: 998,
      paymentMethod: 'cash_on_delivery',
      paymentState: 'due_on_delivery',
      shippingMinor: 500,
      status: 'placed',
      totalMinor: 1_498,
    });
    expect(await productStock()).toBe(before - 2);
    expect(await prisma.order.count()).toBe(1);
    expect(
      await prisma.cartItem.count({ where: { cartId: cart.cartId } }),
    ).toBe(0);
    expect(await prisma.cartReservation.count()).toBe(0);
  });

  it('uses current server prices and rejects changed idempotent input', async () => {
    const userId = await createUser('price@example.com');
    const cart = await desiredCart(1);
    await prisma.product.update({
      data: { priceMinor: 777 },
      where: { slug: productSlug },
    });
    const context = {
      cartId: cart.cartId,
      idempotencyKey: 'price-order-0001',
      userId,
    };
    const created = await orders.create(context, checkoutBody(1), now);
    expect(created.items[0]).toMatchObject({
      lineTotalMinor: 777,
      priceMinor: 777,
    });
    await expect(
      orders.create(
        context,
        { ...checkoutBody(1), city: 'Different city' },
        now,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back stock, order and cart when cart clearing fails', async () => {
    const userId = await createUser('rollback@example.com');
    const cart = await desiredCart(2);
    const before = await productStock();
    await postgres.query(`
      CREATE FUNCTION o2s_reject_cart_clear() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'O2S injected cart clearing failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "o2s_reject_cart_clear"
      BEFORE DELETE ON "CartItem"
      FOR EACH ROW EXECUTE FUNCTION o2s_reject_cart_clear();
    `);
    try {
      await expect(
        orders.create(
          {
            cartId: cart.cartId,
            idempotencyKey: 'rollback-order-0001',
            userId,
          },
          checkoutBody(2),
          now,
        ),
      ).rejects.toBeDefined();
    } finally {
      await postgres.query(`
        DROP TRIGGER IF EXISTS "o2s_reject_cart_clear" ON "CartItem";
        DROP FUNCTION IF EXISTS o2s_reject_cart_clear();
      `);
    }
    expect(await prisma.order.count()).toBe(0);
    expect(await productStock()).toBe(before);
    expect(
      await prisma.cartItem.count({ where: { cartId: cart.cartId } }),
    ).toBe(1);
  });

  it('returns safe all-line shortages and leaves the desired cart unchanged', async () => {
    const userId = await createUser('shortage@example.com');
    const cart = await desiredCart(3);
    await prisma.product.update({
      data: { stockAmount: 2 },
      where: { slug: productSlug },
    });

    const error = await orders
      .create(
        {
          cartId: cart.cartId,
          idempotencyKey: 'shortage-order-0001',
          userId,
        },
        checkoutBody(3),
        now,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toEqual({
      checkedAt: now.toISOString(),
      lines: [
        {
          outcome: 'insufficient_stock',
          productSlug,
          requestedAmount: 3,
        },
      ],
      status: 'allocation-unavailable',
    });
    expect(
      JSON.stringify((error as UnprocessableEntityException).getResponse()),
    ).not.toMatch(/stockAmount|productId|reservation|supplier|provider/i);
    expect(await prisma.order.count()).toBe(0);
    expect(await productStock()).toBe(2);
    expect(
      await prisma.cartItem.findFirstOrThrow({
        where: { cartId: cart.cartId },
      }),
    ).toMatchObject({ amount: 3 });
  });

  it('lets exactly one concurrent buyer allocate the final unit', async () => {
    const [firstUserId, secondUserId] = await Promise.all([
      createUser('first@example.com'),
      createUser('second@example.com'),
    ]);
    const [firstCart, secondCart] = await Promise.all([
      desiredCart(1),
      desiredCart(1),
    ]);
    await prisma.product.update({
      data: { stockAmount: 1 },
      where: { slug: productSlug },
    });

    const attempts = await Promise.allSettled([
      orders.create(
        {
          cartId: firstCart.cartId,
          idempotencyKey: 'last-stock-first',
          userId: firstUserId,
        },
        checkoutBody(1),
        now,
      ),
      orders.create(
        {
          cartId: secondCart.cartId,
          idempotencyKey: 'last-stock-second',
          userId: secondUserId,
        },
        checkoutBody(1),
        now,
      ),
    ]);

    expect(
      attempts.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    expect(await prisma.order.count()).toBe(1);
    expect(await productStock()).toBe(0);
    expect(await prisma.cartItem.count()).toBe(1);
  });

  it('keeps Stripe unreachable until payment-first allocation is implemented', async () => {
    const userId = await createUser('stripe@example.com');
    const cart = await desiredCart(1);
    await expect(
      orders.create(
        {
          cartId: cart.cartId,
          idempotencyKey: 'stripe-order-0001',
          userId,
        },
        {
          ...checkoutBody(1),
          paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
        },
        now,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(orders).not.toHaveProperty('finalizeVerifiedStripePayment');
    expect(await prisma.order.count()).toBe(0);
    expect(await productStock()).toBe(100);
  });

  async function createUser(email: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email, normalizedEmail: email },
      select: { id: true },
    });
    return user.id;
  }

  async function desiredCart(amount: number) {
    const created = await carts.createAndAdd({ productSlug, amount }, now);
    const capability = await carts.authenticate(created.rawToken, now);
    if (!capability) throw new Error('Expected active cart capability');
    return capability;
  }

  async function productStock(): Promise<number> {
    return (
      await prisma.product.findUniqueOrThrow({
        select: { stockAmount: true },
        where: { slug: productSlug },
      })
    ).stockAmount;
  }
});

function checkoutBody(amount: number) {
  return {
    city: 'Portland',
    fullName: 'Ada Brewer',
    items: [{ productSlug, amount }],
    paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
    phoneNumber: '+1 555 0100',
    shippingAddress: '10 Brewery Lane',
  };
}
