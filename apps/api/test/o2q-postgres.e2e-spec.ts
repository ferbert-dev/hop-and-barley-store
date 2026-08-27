import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/database/prisma.service';
import { CheckoutPaymentMethod } from '../src/orders/dto/create-order.dto';
import { OrdersService } from '../src/orders/orders.service';

const describePostgres =
  process.env.RUN_O2Q_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const citraSlug = 'citra-hops';
const now = new Date(Math.floor(Date.now() / 1_000) * 1_000);

describePostgres('O2Q measured products with disposable PostgreSQL', () => {
  let app: INestApplication;
  let carts: CartService;
  let orders: OrdersService;
  let postgres: Client;
  let prisma: PrismaService;

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
    carts = app.get(CartService);
    orders = app.get(OrdersService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.user.deleteMany();
    await prisma.product.updateMany({ data: { isActive: true } });
    await prisma.product.update({
      data: { stockAmount: 100_000_000 },
      where: { slug: citraSlug },
    });
  });

  it('deploys measured constraints and the canonical fixture metadata', async () => {
    const constraints = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'Product_stockAmount_nonnegative_check',
        'Product_sale_amounts_check',
        'Product_sale_kind_check',
        'Product_optional_physical_amounts_check',
        'CartItem_amount_check',
        'CartReservation_amount_check',
        'OrderItem_amount_check',
        'OrderItem_pricing_check',
        'OrderItem_sale_kind_check'
      )
      ORDER BY conname
    `);
    expect(constraints.rows).toHaveLength(9);

    const products = await prisma.product.findMany({
      select: {
        amountUnit: true,
        kitYieldVolumeMl: true,
        maximumOrderAmount: true,
        minimumOrderAmount: true,
        orderStepAmount: true,
        packageNetWeightMg: true,
        priceBasisAmount: true,
        priceMinor: true,
        saleKind: true,
        slug: true,
        stockAmount: true,
      },
    });
    expect(products.find(({ slug }) => slug === citraSlug)).toMatchObject({
      amountUnit: 'MILLIGRAM',
      maximumOrderAmount: null,
      minimumOrderAmount: 100_000,
      orderStepAmount: 5_000,
      priceBasisAmount: 100_000,
      priceMinor: 599,
      saleKind: 'WEIGHT',
      stockAmount: 100_000_000,
    });
    expect(
      products.find(({ slug }) => slug === 'safale-us05-yeast'),
    ).toMatchObject({
      amountUnit: 'EACH',
      packageNetWeightMg: 11_500,
      saleKind: 'PACKAGE',
    });
    expect(
      products.find(({ slug }) => slug === 'imperial-yeast'),
    ).toMatchObject({ packageNetWeightMg: null, saleKind: 'PACKAGE' });
    expect(
      products.find(({ slug }) => slug === 'west-coast-ipa-kit'),
    ).toMatchObject({
      amountUnit: 'EACH',
      kitYieldVolumeMl: 18_927,
      saleKind: 'KIT',
    });
  });

  it('prices 155 g authoritatively and rejects values outside the 5 g lattice', async () => {
    const server = app.getHttpServer() as App;
    const accepted = await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ amount: 155_000, productSlug: citraSlug })
      .expect(200);

    expect(accepted.body).toMatchObject({
      checkoutEligible: true,
      distinctItemCount: 1,
      subtotalMinor: 928,
      items: [
        {
          amount: 155_000,
          amountUnit: 'MILLIGRAM',
          lineTotalMinor: 928,
          priceBasisAmount: 100_000,
          priceMinor: 599,
          productSlug: citraSlug,
          reservationStatus: 'active',
          saleKind: 'WEIGHT',
        },
      ],
    });
    expect(
      await prisma.cartReservation.findFirstOrThrow({
        where: { status: 'ACTIVE' },
      }),
    ).toMatchObject({ amount: 155_000 });

    await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ amount: 157_000, productSlug: citraSlug })
      .expect(422);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ amount: 2_000_000_001, productSlug: citraSlug })
      .expect(400);
  });

  it('accepts a 100 kg catalog amount without imposing a product maximum', async () => {
    const accepted = await request(app.getHttpServer() as App)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ amount: 100_000_000, productSlug: citraSlug })
      .expect(200);

    expect(accepted.body).toMatchObject({
      checkoutEligible: true,
      subtotalMinor: 599_000,
      items: [
        {
          amount: 100_000_000,
          lineTotalMinor: 599_000,
          maximumOrderAmount: null,
          stockAmount: 100_000_000,
        },
      ],
    });
  });

  it('snapshots and consumes a 10 kg checkout in milligrams', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'o2q@example.com',
        normalizedEmail: 'o2q@example.com',
      },
      select: { id: true },
    });
    const createdCart = await carts.createAndAdd(
      { amount: 10_000_000, productSlug: citraSlug },
      now,
    );
    const capability = await carts.authenticate(createdCart.rawToken, now);
    if (!capability) throw new Error('Expected an active cart capability');

    const order = await orders.create(
      {
        cartId: capability.cartId,
        idempotencyKey: 'o2q-10kg-order',
        userId: user.id,
      },
      {
        city: 'Portland',
        fullName: 'Ada Brewer',
        items: [{ amount: 10_000_000, productSlug: citraSlug }],
        paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
        phoneNumber: '+1 555 0100',
        shippingAddress: '10 Brewery Lane',
      },
      new Date(now.getTime() + 60_000),
    );

    expect(order).toMatchObject({
      itemSubtotalMinor: 59_900,
      totalMinor: 60_400,
      items: [
        {
          amount: 10_000_000,
          amountUnit: 'MILLIGRAM',
          lineTotalMinor: 59_900,
          priceBasisAmount: 100_000,
          priceMinor: 599,
          saleKind: 'WEIGHT',
        },
      ],
    });
    expect(
      await prisma.product.findUniqueOrThrow({ where: { slug: citraSlug } }),
    ).toMatchObject({ stockAmount: 90_000_000 });
    expect(
      await prisma.cartReservation.findFirstOrThrow({
        where: { orderId: order.id },
      }),
    ).toMatchObject({ amount: 10_000_000, status: 'CONSUMED' });
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.end();
  });
});
