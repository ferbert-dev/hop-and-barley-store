import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { hashCartToken } from '../src/cart/cart-token';
import { PrismaService } from '../src/database/prisma.service';

const describePostgres =
  process.env.RUN_O0_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

describePostgres('O0 guest cart with disposable PostgreSQL 17.6', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let postgres: Client;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'o0-line-' } },
    });
  });

  afterAll(async () => {
    await app.close();
    await postgres.end();
  });

  it('proves no-cookie GET does not create database state', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/v1/cart')
      .expect(200);
    expect(await prisma.cart.count()).toBe(0);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it('stores only SHA-256 and serializes concurrent add, absolute update and clear', async () => {
    const server = app.getHttpServer() as App;
    const created = await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ productSlug: 'safale-us05-yeast', amount: 2 })
      .expect(200);
    const setCookie = created.headers['set-cookie']?.[0];
    if (!setCookie) throw new Error('Expected cart cookie');
    const cookie = setCookie.split(';', 1)[0];
    const rawToken = cookie.slice(cookie.indexOf('=') + 1);
    const persisted = await prisma.cart.findFirstOrThrow({
      select: { id: true, tokenDigest: true },
    });
    expect(Buffer.from(persisted.tokenDigest)).toEqual(hashCartToken(rawToken));
    expect(JSON.stringify(persisted)).not.toContain(rawToken);
    expect(JSON.stringify(created.body)).not.toMatch(/cartId|token|digest/i);

    const csrfResponse = await request(server)
      .get('/api/v1/cart/csrf')
      .set('Cookie', cookie)
      .expect(200);
    const csrf = (csrfResponse.body as { csrfToken: string }).csrfToken;
    const mutationHeaders = {
      Cookie: cookie,
      Origin: 'http://localhost:3000',
      'X-CSRF-Token': csrf,
    };

    await Promise.all(
      Array.from({ length: 6 }, () =>
        request(server)
          .post('/api/v1/cart/items')
          .set(mutationHeaders)
          .send({ productSlug: 'safale-us05-yeast', amount: 1 })
          .expect(200),
      ),
    );
    expect(
      await prisma.cartItem.findFirstOrThrow({
        where: {
          cartId: persisted.id,
          product: { slug: 'safale-us05-yeast' },
        },
      }),
    ).toMatchObject({ amount: 8 });
    expect(
      await prisma.cartItem.count({ where: { cartId: persisted.id } }),
    ).toBe(1);

    await Promise.all(
      [4, 5, 6, 7].map((amount) =>
        request(server)
          .patch('/api/v1/cart/items/safale-us05-yeast')
          .set(mutationHeaders)
          .send({ amount })
          .expect(200),
      ),
    );
    const updated = await prisma.cartItem.findFirstOrThrow({
      where: { cartId: persisted.id },
    });
    expect([4, 5, 6, 7]).toContain(updated.amount);

    await Promise.all([
      request(server)
        .delete('/api/v1/cart/items')
        .set(mutationHeaders)
        .expect(200),
      request(server)
        .post('/api/v1/cart/items')
        .set(mutationHeaders)
        .send({ productSlug: 'safale-us05-yeast', amount: 1 })
        .expect(200),
    ]);
    expect(
      await prisma.cartItem.count({ where: { cartId: persisted.id } }),
    ).toBeLessThanOrEqual(1);
  });

  it('enforces named digest, expiry, amount and composite-line SQL constraints', async () => {
    await expect(
      postgres.query(
        `INSERT INTO "Cart" ("tokenDigest", "expiresAt", "updatedAt") VALUES (decode('aa', 'hex'), CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      postgres.query(
        `INSERT INTO "Cart" ("tokenDigest", "createdAt", "expiresAt", "updatedAt") VALUES (decode(repeat('ab', 32), 'hex'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });

    const cart = await prisma.cart.create({
      data: {
        expiresAt: new Date(Date.now() + 86_400_000),
        tokenDigest: Uint8Array.from(hashCartToken('C'.repeat(43))),
      },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: 'safale-us05-yeast' },
    });
    await expect(
      postgres.query(
        `INSERT INTO "CartItem" ("cartId", "productId", "amount", "updatedAt") VALUES ($1, $2, 0, CURRENT_TIMESTAMP)`,
        [cart.id, product.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: product.id, amount: 1 },
    });
    await expect(
      prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, amount: 2 },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('fails active/USD/stock checks before first-cart persistence and rejects expiry', async () => {
    const server = app.getHttpServer() as App;
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: 'safale-us05-yeast' },
    });
    for (const data of [
      { isActive: false },
      { currency: 'EUR' },
      { stockAmount: 0 },
    ]) {
      await prisma.product.update({ data, where: { id: product.id } });
      await request(server)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .send({ productSlug: 'safale-us05-yeast', amount: 1 })
        .expect(422);
      expect(await prisma.cart.count()).toBe(0);
      await prisma.product.update({
        data: { currency: 'USD', isActive: true, stockAmount: 100 },
        where: { id: product.id },
      });
    }

    const expiredToken = 'D'.repeat(43);
    await postgres.query(
      `INSERT INTO "Cart" ("tokenDigest", "createdAt", "expiresAt", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP - interval '2 days', CURRENT_TIMESTAMP - interval '1 day', CURRENT_TIMESTAMP - interval '2 days')`,
      [hashCartToken(expiredToken)],
    );
    await request(server)
      .get('/api/v1/cart')
      .set('Cookie', `hb_cart=${expiredToken}`)
      .expect(401);
  });

  it('enforces 50 distinct lines transactionally in PostgreSQL', async () => {
    const category = await prisma.category.findFirstOrThrow();
    await postgres.query(
      `INSERT INTO "Product" ("id", "name", "slug", "teaser", "description", "priceMinor", "priceQualifier", "currency", "saleKind", "amountUnit", "priceBasisAmount", "minimumOrderAmount", "orderStepAmount", "stockAmount", "isActive", "imagePath", "specifications", "categoryId", "updatedAt")
       SELECT gen_random_uuid(), 'O0 line ' || value, 'o0-line-' || lpad(value::text, 2, '0'), 'fixture', 'fixture', 100, 'fixture', 'USD', 'PACKAGE', 'EACH', 1, 1, 1, 100, true, '/assets/products/o0-line-' || lpad(value::text, 2, '0') || '.webp', '[]'::jsonb, $1, CURRENT_TIMESTAMP
       FROM generate_series(1, 51) value`,
      [category.id],
    );
    const rawToken = 'E'.repeat(43);
    const cart = await prisma.cart.create({
      data: {
        expiresAt: new Date(Date.now() + 86_400_000),
        tokenDigest: Uint8Array.from(hashCartToken(rawToken)),
      },
    });
    const products = await prisma.product.findMany({
      orderBy: { slug: 'asc' },
      take: 50,
      where: { slug: { startsWith: 'o0-line-' } },
    });
    await prisma.cartItem.createMany({
      data: products.map(({ id }) => ({
        cartId: cart.id,
        productId: id,
        amount: 1,
      })),
    });
    const cookie = `hb_cart=${rawToken}`;
    const csrfResponse = await request(app.getHttpServer() as App)
      .get('/api/v1/cart/csrf')
      .set('Cookie', cookie)
      .expect(200);
    const csrf = (csrfResponse.body as { csrfToken: string }).csrfToken;
    await request(app.getHttpServer() as App)
      .post('/api/v1/cart/items')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({ productSlug: 'o0-line-51', amount: 1 })
      .expect(422);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(
      50,
    );
  });
});
