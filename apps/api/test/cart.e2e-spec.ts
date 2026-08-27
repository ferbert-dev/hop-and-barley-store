import { INestApplication, UnprocessableEntityException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { CartCsrfService } from '../src/cart/cart-csrf.service';
import { CartModule } from '../src/cart/cart.module';
import type { ActiveCartCapability } from '../src/cart/cart-request';
import { CartService } from '../src/cart/cart.service';
import type { CartDto } from '../src/cart/dto/cart-response.dto';
import { configureOpenApi } from '../src/openapi';

const rawToken = 'A'.repeat(43);
const unknownToken = 'B'.repeat(43);
const activeCart: ActiveCartCapability = {
  cartId: '30000000-0000-4000-8000-000000000001',
  expiresAt: new Date('2026-09-21T00:00:00.000Z'),
  rawToken,
};
const cart: CartDto = {
  adjustmentMessage: null,
  checkoutEligible: true,
  currency: 'USD',
  distinctItemCount: 1,
  items: [
    {
      amountUnit: 'EACH',
      availability: 'available',
      priceMinor: 699,
      imagePath: '/assets/products/cascade-hops.webp',
      lineTotalMinor: 1398,
      kitYieldVolumeMl: null,
      maximumOrderAmount: null,
      minimumOrderAmount: 1,
      name: 'Cascade Hops',
      orderStepAmount: 1,
      packageNetWeightMg: null,
      priceBasisAmount: 1,
      priceQualifier: 'per pound',
      productId: '20000000-0000-4000-8000-000000000002',
      productSlug: 'cascade-hops',
      amount: 2,
      reservationExpiresAt: '2026-08-25T12:15:00.000Z',
      reservationStatus: 'active',
      saleKind: 'PACKAGE',
      stockAmount: 100,
    },
  ],
  serverNow: '2026-08-25T12:00:00.000Z',
  subtotalMinor: 1398,
};

describe('Cart API security contract (e2e)', () => {
  let app: INestApplication;
  const carts = {
    add: jest.fn().mockResolvedValue(cart),
    authenticate: jest.fn((candidate: string) =>
      Promise.resolve(candidate === rawToken ? activeCart : null),
    ),
    clear: jest.fn().mockResolvedValue({
      adjustmentMessage: null,
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
      serverNow: '2026-08-25T12:00:00.000Z',
      subtotalMinor: 0,
    }),
    createAndAdd: jest.fn().mockResolvedValue({
      cart,
      expiresAt: new Date('2026-09-21T00:00:00.000Z'),
      rawToken,
    }),
    empty: jest.fn().mockReturnValue({
      adjustmentMessage: null,
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
      serverNow: '2026-08-25T12:00:00.000Z',
      subtotalMinor: 0,
    }),
    getCart: jest.fn().mockResolvedValue(cart),
    recheck: jest.fn().mockResolvedValue(cart),
    remove: jest.fn().mockResolvedValue(cart),
    update: jest.fn().mockResolvedValue(cart),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), CartModule],
    })
      .overrideProvider(CartService)
      .useValue(carts)
      .compile();
    app = module.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    configureOpenApi(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('keeps no-cookie GET read-only and returns an empty private cart', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/cart')
      .set('X-Request-Id', 'cart-read-empty-1')
      .expect(200);

    expect(response.body).toEqual(carts.empty());
    expect(carts.authenticate).not.toHaveBeenCalled();
    expect(carts.createAndAdd).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
    expectPrivate(response.headers, 'cart-read-empty-1');
  });

  it.each([
    ['malformed', 'hb_cart=bad'],
    ['bare malformed', 'hb_cart'],
    ['ambiguous', `hb_cart=${rawToken}; hb_cart=${unknownToken}`],
    ['unknown or expired', `hb_cart=${unknownToken}`],
  ])(
    'rejects a %s cookie generically instead of bootstrapping',
    async (_label, cookie) => {
      const response = await request(app.getHttpServer() as App)
        .get('/api/v1/cart')
        .set('Cookie', cookie)
        .expect(401);
      expect(response.body).toEqual({ status: 'unauthorized' });
      expect(response.headers['set-cookie']).toBeUndefined();
      expectPrivate(response.headers);
    },
  );

  it('issues CSRF only for an existing valid cart and binds it to that cart', async () => {
    const server = app.getHttpServer() as App;
    await request(server).get('/api/v1/cart/csrf').expect(401);
    const response = await request(server)
      .get('/api/v1/cart/csrf')
      .set('Cookie', `hb_cart=${rawToken}`)
      .expect(200);
    const csrf = (response.body as unknown as { csrfToken: string }).csrfToken;
    expect(csrf).toMatch(/^cart-test-v1\.[A-Za-z0-9_-]{43}$/);
    expect(app.get(CartCsrfService).verify(csrf, rawToken)).toBe(true);
    expect(app.get(CartCsrfService).verify(csrf, unknownToken)).toBe(false);
    expectPrivate(response.headers);
  });

  it('bootstraps only a truly absent cookie after exact-Origin JSON validation', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ productSlug: 'cascade-hops', amount: 2 })
      .expect(200);
    expect(carts.createAndAdd).toHaveBeenCalledWith({
      productSlug: 'cascade-hops',
      amount: 2,
    });
    expect(response.headers['set-cookie']?.[0]).toMatch(
      /^hb_cart=[A-Za-z0-9_-]{43}; Max-Age=2592000; Expires=.+; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(JSON.stringify(response.body)).not.toMatch(/cartId|token|digest/i);
    expectPrivate(response.headers);
  });

  it('does not create state or a cookie after failed first-product validation', async () => {
    carts.createAndAdd.mockRejectedValueOnce(
      new UnprocessableEntityException({ status: 'unavailable' }),
    );
    const response = await request(app.getHttpServer() as App)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .send({ productSlug: 'inactive-product', amount: 2 })
      .expect(422);
    expect(response.body).toEqual({ status: 'unavailable' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects wrong Origin, non-JSON, unknown fields and invalid amounts', async () => {
    const server = app.getHttpServer() as App;
    await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://evil.example')
      .send({ productSlug: 'cascade-hops', amount: 1 })
      .expect(403);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('no')
      .expect(415);
    await request(server)
      .patch('/api/v1/cart/items/cascade-hops')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('no')
      .expect(415);
    for (const body of [
      { productSlug: 'cascade-hops', amount: 0 },
      { productSlug: 'cascade-hops', amount: 2_000_000_001 },
      { productSlug: 'cascade-hops', amount: 1, priceMinor: 1 },
    ]) {
      await request(server)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .send(body)
        .expect(400);
    }
  });

  it('never lets a presented invalid cookie fall back to first-cart bootstrap', async () => {
    for (const cookie of [
      'hb_cart=bad',
      'hb_cart',
      `hb_cart=${unknownToken}`,
    ]) {
      const response = await request(app.getHttpServer() as App)
        .post('/api/v1/cart/items')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:3000')
        .send({ productSlug: 'cascade-hops', amount: 1 })
        .expect(401);
      expect(response.body).toEqual({ status: 'unauthorized' });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(carts.createAndAdd).not.toHaveBeenCalled();
  });

  it('requires the cart-bound CSRF for every existing-cart mutation route', async () => {
    const server = app.getHttpServer() as App;
    const cookie = `hb_cart=${rawToken}`;
    const csrf = app.get(CartCsrfService).issue(rawToken);

    await request(server)
      .post('/api/v1/cart/recheck')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .expect(403);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .send({ productSlug: 'cascade-hops', amount: 1 })
      .expect(403);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', app.get(CartCsrfService).issue(unknownToken))
      .send({ productSlug: 'cascade-hops', amount: 1 })
      .expect(403);

    await request(server)
      .post('/api/v1/cart/recheck')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await request(server)
      .post('/api/v1/cart/recheck')
      .set('Cookie', cookie)
      .set('Origin', 'http://evil.example')
      .set('X-CSRF-Token', csrf)
      .expect(403);
    await request(server)
      .post('/api/v1/cart/recheck')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({})
      .expect(415);
    await request(server)
      .post('/api/v1/cart/recheck')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .set('Content-Type', 'text/plain')
      .send('unexpected')
      .expect(415);
    await request(server)
      .post('/api/v1/cart/items')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({ productSlug: 'cascade-hops', amount: 1 })
      .expect(200);
    await request(server)
      .patch('/api/v1/cart/items/cascade-hops')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({ amount: 3 })
      .expect(200);
    await request(server)
      .delete('/api/v1/cart/items/cascade-hops')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .expect(200);
    await request(server)
      .delete('/api/v1/cart/items')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .expect(200);

    expect(carts.add).toHaveBeenCalled();
    expect(carts.recheck).toHaveBeenCalled();
    expect(carts.update).toHaveBeenCalled();
    expect(carts.remove).toHaveBeenCalled();
    expect(carts.clear).toHaveBeenCalled();
  });

  it('documents every route, cart cookie and security header semantically', () => {
    const document = configureOpenApi(app);
    expect(document.components?.securitySchemes?.cartCookie).toMatchObject({
      in: 'cookie',
      name: 'hb_cart',
      type: 'apiKey',
    });
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/cart',
        '/api/v1/cart/csrf',
        '/api/v1/cart/recheck',
        '/api/v1/cart/items',
        '/api/v1/cart/items/{productSlug}',
      ]),
    );
    expect(document.paths['/api/v1/cart']?.get?.security).toBeUndefined();
    expect(document.paths['/api/v1/cart/csrf']?.get?.security).toEqual([
      { cartCookie: [] },
    ]);
    expect(document.paths['/api/v1/cart/recheck']?.post?.security).toEqual([
      { cartCookie: [] },
    ]);
    const cartSchema = document.components?.schemas?.CartDto;
    const cartItemSchema = document.components?.schemas?.CartItemDto;
    expect(cartSchema).toMatchObject({
      properties: {
        adjustmentMessage: { nullable: true, type: 'string' },
        serverNow: { format: 'date-time', type: 'string' },
      },
    });
    expect(
      cartSchema && 'required' in cartSchema ? cartSchema.required : undefined,
    ).toEqual(expect.arrayContaining(['adjustmentMessage', 'serverNow']));
    expect(cartItemSchema).toMatchObject({
      properties: {
        reservationExpiresAt: {
          format: 'date-time',
          nullable: true,
          type: 'string',
        },
        reservationStatus: {
          enum: ['active', 'expired', 'unreserved'],
          type: 'string',
        },
      },
    });
    expect(
      cartItemSchema && 'required' in cartItemSchema
        ? cartItemSchema.required
        : undefined,
    ).toEqual(
      expect.arrayContaining(['reservationExpiresAt', 'reservationStatus']),
    );
    expect(
      document.paths['/api/v1/cart/items']?.post?.parameters?.map(
        (parameter) => ('name' in parameter ? parameter.name : undefined),
      ),
    ).toEqual(expect.arrayContaining(['Origin', 'X-CSRF-Token']));
  });
});

function expectPrivate(
  headers: Record<string, string | string[] | undefined>,
  requestId?: string,
): void {
  expect(headers['cache-control']).toBe('private, no-store');
  expect(headers.vary).toBe('Cookie, Origin');
  expect(headers['x-request-id']).toEqual(
    requestId ?? expect.stringMatching(/^[0-9a-f-]{36}$/),
  );
}
