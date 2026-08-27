import {
  ConflictException,
  type INestApplication,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { AppModule } from '../src/app.module';
import { CsrfService } from '../src/auth/session/csrf.service';
import { createSessionCookie } from '../src/auth/session/session-cookie';
import { SessionService } from '../src/auth/session/session.service';
import { createCartCookie } from '../src/cart/cart-cookie';
import { CartCsrfService } from '../src/cart/cart-csrf.service';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/database/prisma.service';
import { CheckoutPaymentMethod } from '../src/orders/dto/create-order.dto';
import { OrdersService } from '../src/orders/orders.service';

const describePostgres =
  process.env.RUN_O2_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const baseNow = new Date(Math.floor(Date.now() / 1_000) * 1_000);
const productSlug = 'safale-us05-yeast';

describePostgres('O2 orders with disposable PostgreSQL', () => {
  let app: INestApplication;
  let postgres: Client;
  let prisma: PrismaService;
  let carts: CartService;
  let orders: OrdersService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    await app.init();
    prisma = app.get(PrismaService);
    carts = app.get(CartService);
    orders = app.get(OrdersService);
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.user.deleteMany();
    await prisma.product.updateMany({
      data: { isActive: true, stockAmount: 100 },
    });
  });

  it('deploys named order constraints, indexes and reservation ownership', async () => {
    const constraints = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'Order_requestHash_length_check',
        'Order_amounts_check',
        'Order_contact_snapshot_check',
        'Order_payment_outcome_check',
        'Order_userId_fkey',
        'Order_cartId_fkey',
        'OrderItem_amount_check',
        'OrderItem_pricing_check',
        'OrderItem_snapshot_check',
        'CartReservation_order_state_check',
        'CartReservation_orderId_fkey'
      )
      ORDER BY conname
    `);
    const indexes = await postgres.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'Order_cartId_key',
          'Order_userId_idempotencyKey_key',
          'Order_providerPaymentReference_key',
          'Order_userId_placedAt_id_idx',
          'Order_status_placedAt_idx',
          'OrderItem_orderId_productId_key',
          'CartReservation_orderId_idx'
        )
      ORDER BY indexname
    `);

    expect(constraints.rows).toHaveLength(11);
    expect(indexes.rows).toHaveLength(7);
  });

  it('creates one server-priced COD order and returns the same outcome on retry', async () => {
    const userId = await createUser('cod@example.com');
    const { cartId, checkout } = await reservedCheckout(2);
    const product = await prisma.product.findUniqueOrThrow({
      select: { priceMinor: true, stockAmount: true },
      where: { slug: productSlug },
    });
    const context = {
      cartId,
      idempotencyKey: 'cod-order-0001',
      userId,
    };

    const created = await orders.create(context, checkout, atMinutes(1));
    const retried = await orders.create(context, checkout, atMinutes(2));

    expect(retried).toEqual(created);
    expect(created).toMatchObject({
      currency: 'USD',
      itemSubtotalMinor: product.priceMinor * 2,
      paidAt: null,
      paymentMethod: 'cash_on_delivery',
      paymentState: 'due_on_delivery',
      shippingMinor: 500,
      status: 'placed',
      totalMinor: product.priceMinor * 2 + 500,
    });
    expect(JSON.stringify(created)).not.toMatch(
      /userId|cartId|reservationId|requestHash|providerPaymentReference/i,
    );
    expect(await prisma.order.count()).toBe(1);
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } }),
    ).toMatchObject({ stockAmount: product.stockAmount - 2 });
    expect(
      await prisma.cartReservation.findFirstOrThrow({ where: { cartId } }),
    ).toMatchObject({ orderId: created.id, status: 'CONSUMED' });
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(0);
  });

  it('uses current product prices and rejects key reuse with changed checkout', async () => {
    const userId = await createUser('price@example.com');
    const { cartId, checkout } = await reservedCheckout(1);
    const updated = await prisma.product.update({
      data: { priceMinor: { increment: 137 } },
      select: { priceMinor: true },
      where: { slug: productSlug },
    });
    const context = {
      cartId,
      idempotencyKey: 'price-order-0001',
      userId,
    };
    const created = await orders.create(context, checkout, atMinutes(1));
    expect(created.items[0]).toMatchObject({
      lineTotalMinor: updated.priceMinor,
      priceMinor: updated.priceMinor,
    });

    await expect(
      orders.create(
        context,
        { ...checkout, city: 'Different city' },
        atMinutes(2),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.order.count()).toBe(1);
  });

  it('rolls back order, stock and reservation after consumption when cart clearing fails', async () => {
    const userId = await createUser('rollback@example.com');
    const { cartId, checkout } = await reservedCheckout(2);
    const before = await prisma.product.findUniqueOrThrow({
      select: { stockAmount: true },
      where: { slug: productSlug },
    });
    await postgres.query(`
      CREATE FUNCTION o2_reject_cart_clear() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'O2 injected cart clearing failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "o2_reject_cart_clear"
      BEFORE DELETE ON "CartItem"
      FOR EACH ROW EXECUTE FUNCTION o2_reject_cart_clear();
    `);

    try {
      await expect(
        orders.create(
          { cartId, idempotencyKey: 'rollback-order-0001', userId },
          checkout,
          atMinutes(1),
        ),
      ).rejects.toBeDefined();
    } finally {
      await postgres.query(`
        DROP TRIGGER IF EXISTS "o2_reject_cart_clear" ON "CartItem";
        DROP FUNCTION IF EXISTS o2_reject_cart_clear();
      `);
    }

    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(1);
    expect(
      await prisma.cartReservation.findFirstOrThrow({ where: { cartId } }),
    ).toMatchObject({ orderId: null, status: 'ACTIVE' });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } }),
    ).toMatchObject({ stockAmount: before.stockAmount });
  });

  it('fails expired, hidden, mismatched and depleted carts without partial state', async () => {
    const cases = [
      (checkout: ReturnType<typeof checkoutBody>) => ({
        checkout,
        now: atMinutes(15),
      }),
      async (checkout: ReturnType<typeof checkoutBody>) => {
        await prisma.product.update({
          data: { isActive: false },
          where: { slug: productSlug },
        });
        return { checkout, now: atMinutes(1) };
      },
      (checkout: ReturnType<typeof checkoutBody>) => ({
        checkout: { ...checkout, items: [{ productSlug, amount: 2 }] },
        now: atMinutes(1),
      }),
      async (checkout: ReturnType<typeof checkoutBody>) => {
        await prisma.product.update({
          data: { stockAmount: 0 },
          where: { slug: productSlug },
        });
        return { checkout, now: atMinutes(1) };
      },
    ];

    for (let index = 0; index < cases.length; index += 1) {
      await prisma.cartReservation.deleteMany();
      await prisma.order.deleteMany();
      await prisma.cart.deleteMany();
      await prisma.product.update({
        data: { isActive: true, stockAmount: 100 },
        where: { slug: productSlug },
      });
      const userId =
        index === 0
          ? await createUser('invalid@example.com')
          : (
              await prisma.user.findUniqueOrThrow({
                where: { normalizedEmail: 'invalid@example.com' },
              })
            ).id;
      const { cartId, checkout } = await reservedCheckout(1);
      const input = await cases[index](checkout);

      await expect(
        orders.create(
          {
            cartId,
            idempotencyKey: `invalid-order-000${index}`,
            userId,
          },
          input.checkout,
          input.now,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(await prisma.order.count()).toBe(0);
      expect(
        await prisma.cartReservation.findFirstOrThrow({ where: { cartId } }),
      ).toMatchObject({ orderId: null, status: 'ACTIVE' });
    }
  });

  it('rechecks reservation expiry after waiting for the cart lock', async () => {
    const userId = await createUser('lock-expiry@example.com');
    const { cartId, checkout } = await reservedCheckout(1);
    const before = await prisma.product.findUniqueOrThrow({
      select: { stockAmount: true },
      where: { slug: productSlug },
    });

    await postgres.query('BEGIN');
    let finalization: Promise<unknown>;
    try {
      await postgres.query(
        'SELECT "id" FROM "Cart" WHERE "id" = $1 FOR UPDATE',
        [cartId],
      );
      const expiresAt = new Date(Date.now() + 750);
      await prisma.cartReservation.updateMany({
        data: {
          expiresAt,
          reservedAt: new Date(expiresAt.getTime() - 15 * 60 * 1_000),
        },
        where: { cartId, status: 'ACTIVE' },
      });
      finalization = orders.create(
        { cartId, idempotencyKey: 'lock-expiry-order-0001', userId },
        checkout,
      );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } finally {
      await postgres.query('COMMIT');
    }

    await expect(finalization!).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(await prisma.order.count()).toBe(0);
    expect(
      await prisma.cartReservation.findFirstOrThrow({ where: { cartId } }),
    ).toMatchObject({ orderId: null, status: 'ACTIVE' });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } }),
    ).toMatchObject({ stockAmount: before.stockAmount });
  });

  it('coalesces concurrent same-cart retries into one order and stock decrement', async () => {
    const userId = await createUser('concurrent@example.com');
    const { cartId, checkout } = await reservedCheckout(3);
    const before = await prisma.product.findUniqueOrThrow({
      select: { stockAmount: true },
      where: { slug: productSlug },
    });
    const results = await Promise.all([
      orders.create(
        { cartId, idempotencyKey: 'parallel-order-a', userId },
        checkout,
        atMinutes(1),
      ),
      orders.create(
        { cartId, idempotencyKey: 'parallel-order-b', userId },
        checkout,
        atMinutes(1),
      ),
    ]);

    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.order.count()).toBe(1);
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } }),
    ).toMatchObject({ stockAmount: before.stockAmount - 3 });
  });

  it('rejects an old-cart mutation already waiting when checkout commits', async () => {
    const userId = await createUser('in-flight-cart@example.com');
    const { cartId, checkout, rawCartToken } = await reservedCheckout(2);
    const capability = await carts.authenticate(rawCartToken, baseNow);
    if (!capability) throw new Error('Expected active cart capability');
    const before = await prisma.product.findUniqueOrThrow({
      select: { stockAmount: true },
      where: { slug: productSlug },
    });
    const advisoryKey = 2_026_082_602;

    await postgres.query(`
      CREATE FUNCTION o2_pause_cart_finalization() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(${advisoryKey});
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "o2_pause_cart_finalization"
      BEFORE UPDATE ON "Cart"
      FOR EACH ROW EXECUTE FUNCTION o2_pause_cart_finalization();
    `);
    let advisoryTransactionOpen = false;
    let mutation: Promise<unknown>;
    try {
      await postgres.query('BEGIN');
      advisoryTransactionOpen = true;
      await postgres.query('SELECT pg_advisory_xact_lock($1)', [advisoryKey]);
      const finalization = orders.create(
        { cartId, idempotencyKey: 'in-flight-order-0001', userId },
        checkout,
        atMinutes(1),
      );

      try {
        await waitForWaitingLock('advisory');
        mutation = carts.add(
          capability,
          { productSlug, amount: 1 },
          atMinutes(1),
        );
        await waitForWaitingLock('transactionid');
      } finally {
        await postgres.query('COMMIT');
        advisoryTransactionOpen = false;
      }

      await expect(finalization).resolves.toMatchObject({ status: 'placed' });
      await expect(mutation).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    } finally {
      if (advisoryTransactionOpen) await postgres.query('ROLLBACK');
      await postgres.query(`
        DROP TRIGGER IF EXISTS "o2_pause_cart_finalization" ON "Cart";
        DROP FUNCTION IF EXISTS o2_pause_cart_finalization();
      `);
    }

    expect(await prisma.order.count({ where: { cartId } })).toBe(1);
    expect(await prisma.cartItem.count({ where: { cartId } })).toBe(0);
    expect(
      await prisma.cartReservation.count({
        where: { cartId, status: 'ACTIVE' },
      }),
    ).toBe(0);
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } }),
    ).toMatchObject({ stockAmount: before.stockAmount - 2 });
  });

  it('finalizes paid Stripe only through the trusted service boundary', async () => {
    const userId = await createUser('stripe@example.com');
    const { cartId, checkout } = await reservedCheckout(1);
    const stripeCheckout = {
      ...checkout,
      paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
    };

    await expect(
      orders.create(
        { cartId, idempotencyKey: 'stripe-browser-0001', userId },
        stripeCheckout,
        atMinutes(1),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(await prisma.order.count()).toBe(0);

    const paid = await orders.finalizeVerifiedStripePayment(
      {
        cartId,
        checkout: stripeCheckout,
        idempotencyKey: 'stripe-webhook-0001',
        providerPaymentReference: 'cs_test_o2_0001',
        userId,
      },
      atMinutes(2),
    );
    expect(paid).toMatchObject({
      paidAt: atMinutes(2).toISOString(),
      paymentMethod: 'stripe_debit_card',
      paymentState: 'paid',
      status: 'paid',
    });
  });

  it('enforces session, cart, CSRF, input and safe response over HTTP', async () => {
    const userId = await createUser('http@example.com');
    const { cartId, checkout, rawCartToken, cartExpiresAt } =
      await reservedCheckout(1);
    const sessions = app.get(SessionService);
    const session = await sessions.issue(userId, null, baseNow);
    const sessionCookie = createSessionCookie(
      'local-http',
      session.rawToken,
      session.expiresAt,
    ).split(';', 1)[0];
    const cartCookie = createCartCookie(
      'local-http',
      rawCartToken,
      cartExpiresAt,
    ).split(';', 1)[0];
    const csrf = app.get(CsrfService).issue(session.rawToken);
    const server = app.getHttpServer() as App;

    const unauthorized = await request(server)
      .post('/api/v1/orders')
      .set('Cookie', cartCookie)
      .set('Origin', 'http://localhost:3000')
      .set('Idempotency-Key', 'http-order-0001')
      .send(checkout)
      .expect(401);
    expect(unauthorized.headers['set-cookie']).toBeUndefined();

    const invalid = await request(server)
      .post('/api/v1/orders')
      .set('Cookie', [sessionCookie, cartCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'http-order-0001')
      .send({ ...checkout, totalMinor: 1 })
      .expect(400);
    expect(invalid.headers['set-cookie']).toBeUndefined();

    const created = await request(server)
      .post('/api/v1/orders')
      .set('Cookie', [sessionCookie, cartCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'http-order-0001')
      .send(checkout)
      .expect(201);

    expect(created.headers['cache-control']).toBe('private, no-store');
    expect(created.body).toMatchObject({
      paymentState: 'due_on_delivery',
      status: 'placed',
    });
    expect(created.headers['set-cookie']).toEqual([
      expect.stringContaining('hb_cart=; Max-Age=0;'),
    ]);
    const createdOrderId = responseBodyId(created.body);
    expect(JSON.stringify(created.body)).not.toContain(userId);
    expect(
      await prisma.order.findUniqueOrThrow({ where: { cartId } }),
    ).toMatchObject({ userId });

    const replayed = await request(server)
      .post('/api/v1/orders')
      .set('Cookie', [sessionCookie, cartCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'http-order-0001')
      .send(checkout)
      .expect(201);
    expect(responseBodyId(replayed.body)).toBe(createdOrderId);
    expect(replayed.headers['set-cookie']).toEqual([
      expect.stringContaining('hb_cart=; Max-Age=0;'),
    ]);

    const cartCsrf = app.get(CartCsrfService).issue(rawCartToken);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Cookie', [sessionCookie, cartCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', cartCsrf)
      .send({ productSlug, amount: 1 })
      .expect(422);
    expect(
      await prisma.cartReservation.count({
        where: { cartId, status: 'ACTIVE' },
      }),
    ).toBe(0);

    const nextCart = await request(server)
      .post('/api/v1/cart/items')
      .set('Cookie', sessionCookie)
      .set('Origin', 'http://localhost:3000')
      .send({ productSlug, amount: 1 })
      .expect(200);
    const nextCartSetCookies = nextCart.headers['set-cookie'];
    expect(nextCartSetCookies).toHaveLength(1);
    const nextCartCookie = nextCartSetCookies[0].split(';', 1)[0];
    expect(nextCartCookie).not.toBe(cartCookie);

    const secondOrder = await request(server)
      .post('/api/v1/orders')
      .set('Cookie', [sessionCookie, nextCartCookie])
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Idempotency-Key', 'http-order-0002')
      .send(checkoutBody(1))
      .expect(201);
    expect(responseBodyId(secondOrder.body)).not.toBe(createdOrderId);
    expect(await prisma.order.count({ where: { userId } })).toBe(2);
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.end();
  });

  async function createUser(email: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordCredential: { create: credential() },
      },
      select: { id: true },
    });
    return user.id;
  }

  async function reservedCheckout(amount: number) {
    const created = await carts.createAndAdd({ productSlug, amount }, baseNow);
    const capability = await carts.authenticate(created.rawToken, baseNow);
    if (!capability) throw new Error('Expected active cart capability');
    return {
      cartExpiresAt: created.expiresAt,
      cartId: capability.cartId,
      checkout: checkoutBody(amount),
      rawCartToken: created.rawToken,
    };
  }

  async function waitForWaitingLock(locktype: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const locks = await postgres.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM pg_locks WHERE locktype = $1 AND NOT granted',
        [locktype],
      );
      if (Number(locks.rows[0].count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${locktype} lock contention`);
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

function responseBodyId(body: unknown): string {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('id' in body) ||
    typeof body.id !== 'string'
  ) {
    throw new Error('Expected response body id');
  }
  return body.id;
}

function atMinutes(minutes: number): Date {
  return new Date(baseNow.getTime() + minutes * 60 * 1_000);
}

function credential() {
  return {
    algorithm: 'argon2id',
    changedAt: baseNow,
    hashLength: 32,
    memoryCost: 7_168,
    parallelism: 1,
    passwordHash: `$argon2id$v=19$m=7168,p=1,t=5$${'A'.repeat(22)}$${'B'.repeat(43)}`,
    saltLength: 16,
    timeCost: 5,
    version: 19,
  };
}
