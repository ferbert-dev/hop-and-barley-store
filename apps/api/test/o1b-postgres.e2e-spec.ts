import { UnprocessableEntityException } from '@nestjs/common';
import { Client } from 'pg';
import type { ActiveCartCapability } from '../src/cart/cart-request';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/database/prisma.service';

const describePostgres =
  process.env.RUN_O1B_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const alphaSlug = 'o2s-alpha';
const betaSlug = 'o2s-beta';
const now = new Date('2026-08-27T12:00:00.000Z');

describePostgres('O2S desired carts with disposable PostgreSQL', () => {
  let carts: CartService;
  let postgres: Client;
  let prisma: PrismaService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    prisma = new PrismaService();
    carts = new CartService(prisma);
    const category = await prisma.category.findFirstOrThrow();
    for (const [slug, name] of [
      [alphaSlug, 'O2S Alpha'],
      [betaSlug, 'O2S Beta'],
    ] as const) {
      await prisma.product.upsert({
        create: {
          amountUnit: 'EACH',
          categoryId: category.id,
          currency: 'EUR',
          description: 'O2S disposable desired-cart fixture',
          imagePath: `/assets/products/${slug}.webp`,
          isActive: true,
          kitYieldVolumeMl: null,
          maximumOrderAmount: null,
          minimumOrderAmount: 1,
          name,
          orderStepAmount: 1,
          packageNetWeightMg: null,
          priceBasisAmount: 1,
          priceMinor: 500,
          priceQualifier: 'per fixture',
          saleKind: 'PACKAGE',
          slug,
          specifications: [],
          stockAmount: 10,
          teaser: 'O2S fixture',
        },
        update: { currency: 'EUR', isActive: true, stockAmount: 10 },
        where: { slug },
      });
    }
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.updateMany({
      data: {
        activeFrom: null,
        activeUntil: null,
        currency: 'EUR',
        isActive: true,
        stockAmount: 10,
      },
      where: { slug: { in: [alphaSlug, betaSlug] } },
    });
  });

  afterAll(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.deleteMany({
      where: { slug: { in: [alphaSlug, betaSlug] } },
    });
    await prisma.$disconnect();
    await postgres.end();
  });

  it('deploys dormant reservation and canonical weight guards', async () => {
    const constraints = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'CartReservation_dormant_status_check',
        'CartItem_currentReservation_dormant_check',
        'Product_weight_order_lattice_check'
      )
      ORDER BY conname
    `);
    expect(constraints.rows).toHaveLength(3);

    const created = await carts.createAndAdd(
      { productSlug: alphaSlug, amount: 1 },
      now,
    );
    const capability = await requireCapability(created.rawToken);
    const item = await prisma.cartItem.findFirstOrThrow({
      where: { cartId: capability.cartId },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: alphaSlug },
    });
    await expect(
      postgres.query(
        `INSERT INTO "CartReservation" ("cartId", "cartItemId", "productId", "amount", "status", "reservedAt", "expiresAt", "updatedAt") VALUES ($1, $2, $3, 1, 'ACTIVE', $4::timestamp, $4::timestamp + interval '15 minutes', $4::timestamp)`,
        [capability.cartId, item.id, product.id, now],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('stores desired amounts without consulting or changing stock', async () => {
    await prisma.product.update({
      data: { stockAmount: 0 },
      where: { slug: alphaSlug },
    });
    const created = await carts.createAndAdd(
      { productSlug: alphaSlug, amount: 25 },
      now,
    );
    const capability = await requireCapability(created.rawToken);
    const updated = await carts.update(
      capability,
      alphaSlug,
      { amount: 50 },
      now,
    );

    expect(updated.items[0]).toMatchObject({
      amount: 50,
      productSlug: alphaSlug,
      stockAmount: 0,
    });
    expect(await prisma.cartReservation.count()).toBe(0);
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: alphaSlug } }),
    ).toMatchObject({ stockAmount: 0 });
  });

  it('reports every line safely without changing cart or stock', async () => {
    await prisma.product.update({
      data: { stockAmount: 0 },
      where: { slug: betaSlug },
    });
    const created = await carts.createAndAdd(
      { productSlug: alphaSlug, amount: 2 },
      now,
    );
    const capability = await requireCapability(created.rawToken);
    await carts.add(capability, { productSlug: betaSlug, amount: 3 }, now);

    const readiness = await carts.checkoutReadiness(capability, now);

    expect(readiness).toEqual({
      checkedAt: now.toISOString(),
      lines: [
        {
          outcome: 'available',
          productSlug: alphaSlug,
          requestedAmount: 2,
        },
        {
          outcome: 'insufficient_stock',
          productSlug: betaSlug,
          requestedAmount: 3,
        },
      ],
      status: 'unavailable',
    });
    expect(JSON.stringify(readiness)).not.toMatch(
      /stockAmount|productId|reservation|supplier|provider/i,
    );
    expect(
      await prisma.cartItem.count({ where: { cartId: capability.cartId } }),
    ).toBe(2);
    expect(await prisma.cartReservation.count()).toBe(0);
  });

  it('rejects scheduled additions and expired line updates at the exact server time', async () => {
    await prisma.product.update({
      data: { activeFrom: new Date(now.getTime() + 1) },
      where: { slug: betaSlug },
    });
    await expect(
      carts.createAndAdd({ productSlug: betaSlug, amount: 1 }, now),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const created = await carts.createAndAdd(
      { productSlug: alphaSlug, amount: 1 },
      now,
    );
    const capability = await requireCapability(created.rawToken);
    await prisma.product.update({
      data: { activeUntil: now },
      where: { slug: alphaSlug },
    });

    await expect(
      carts.update(capability, alphaSlug, { amount: 2 }, now),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(carts.checkoutReadiness(capability, now)).resolves.toEqual({
      checkedAt: now.toISOString(),
      lines: [
        {
          outcome: 'product_unavailable',
          productSlug: alphaSlug,
          requestedAmount: 1,
        },
      ],
      status: 'unavailable',
    });
  });

  it('allows two distinct weight lines to request 100 kg each', async () => {
    await prisma.product.updateMany({
      data: { isActive: true, stockAmount: 0 },
      where: { slug: { in: ['citra-hops', 'mosaic-hops'] } },
    });
    const created = await carts.createAndAdd(
      { productSlug: 'citra-hops', amount: 100_000_000 },
      now,
    );
    const capability = await requireCapability(created.rawToken);
    const cart = await carts.add(
      capability,
      { productSlug: 'mosaic-hops', amount: 100_000_000 },
      now,
    );

    expect(cart.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: 100_000_000,
          productSlug: 'citra-hops',
        }),
        expect.objectContaining({
          amount: 100_000_000,
          productSlug: 'mosaic-hops',
        }),
      ]),
    );
  });

  async function requireCapability(
    rawToken: string,
  ): Promise<ActiveCartCapability> {
    const capability = await carts.authenticate(rawToken, now);
    if (!capability) throw new Error('Expected active cart capability');
    return capability;
  }
});
