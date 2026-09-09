import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { hashCheckoutCapability } from '../src/checkout/checkout-capability-token';
import { CheckoutService } from '../src/checkout/checkout.service';
import type { CheckoutDraftDto } from '../src/checkout/dto/checkout-draft.dto';
import { PrismaService } from '../src/database/prisma.service';
import { CheckoutPaymentMethod } from '../src/orders/dto/create-order.dto';

const describePostgres =
  process.env.RUN_O2G_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const productSlug = 'safale-us05-yeast';

describePostgres(
  'O2G private guest checkout with disposable PostgreSQL',
  () => {
    let app: INestApplication;
    let checkout: CheckoutService;
    let postgres: Client;
    let prisma: PrismaService;

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
      checkout = app.get(CheckoutService);
      prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
      await prisma.checkoutDraftRequest.deleteMany();
      await prisma.checkoutDraft.deleteMany();
      await prisma.cartReservation.deleteMany();
      await prisma.order.deleteMany();
      await prisma.cart.deleteMany();
      await prisma.user.deleteMany();
      await prisma.product.update({
        data: {
          currency: 'EUR',
          isActive: true,
          priceMinor: 325,
          stockAmount: 100,
        },
        where: { slug: productSlug },
      });
    });

    afterAll(async () => {
      await app?.close();
      await postgres?.end();
    });

    it('stores only the digest, snapshots Unicode delivery, and does not touch commerce state', async () => {
      const access = await createGuestCart();
      const stockBefore = await productStock();
      const created = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-draft-0001')
        .send(aeDraft())
        .expect(200);

      expect(created.headers['cache-control']).toBe('private, no-store');
      const checkoutCookie = requireCookie(
        created.headers['set-cookie'],
        'hb_guest_checkout',
      );
      const rawCapability = checkoutCookie.slice(
        checkoutCookie.indexOf('=') + 1,
      );
      const stored = await prisma.checkoutDraft.findUniqueOrThrow({
        where: { cartId: access.cartId },
      });
      expect(Buffer.from(stored.guestCapabilityDigest!)).toEqual(
        hashCheckoutCapability(rawCapability),
      );
      expect(
        stored.guestCapabilityExpiresAt!.getTime() - stored.createdAt.getTime(),
      ).toBe(24 * 60 * 60 * 1_000);
      expect(stored).toMatchObject({
        administrativeArea: null,
        city: 'دبي',
        countryCode: 'AE',
        email: 'ada@example.com',
        fullName: 'آدا برور',
        postalCode: null,
        street: 'شارع الشيخ زايد',
        userId: null,
      });
      expect(created.body).toMatchObject({
        currency: 'EUR',
        delivery: {
          city: 'دبي',
          countryCode: 'AE',
          postalCode: null,
          street: 'شارع الشيخ زايد',
        },
        email: 'ada@example.com',
        itemSubtotalMinor: 325,
        paymentMethod: 'stripe_debit_card',
        quoteStatus: 'ready',
        shippingMinor: 500,
        status: 'pre_payment',
        totalMinor: 825,
      });
      expect((created.body as CheckoutDraftDto).quotedAt).toEqual(
        expect.any(String),
      );
      expect(JSON.stringify(created.body)).not.toMatch(
        /capability|digest|cartId|userId|requestHash/i,
      );
      expect(JSON.stringify(stored)).not.toContain(rawCapability);
      expect(await productStock()).toBe(stockBefore);
      expect(await prisma.cartReservation.count()).toBe(0);
      expect(await prisma.order.count()).toBe(0);
      expect(
        await prisma.cartItem.count({ where: { cartId: access.cartId } }),
      ).toBe(1);

      const current = await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/draft')
        .set('Cookie', `${access.cartCookie}; ${checkoutCookie}`)
        .expect(200);
      const currentBody = current.body as CheckoutDraftDto;
      expect(currentBody).toEqual({
        ...(created.body as CheckoutDraftDto),
        quotedAt: currentBody.quotedAt,
      });
      expect(typeof currentBody.quotedAt).toBe('string');
      await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/draft')
        .set('Cookie', access.cartCookie)
        .expect(401);
    });

    it('replays one stored response, conflicts on changed input, and never slides expiry', async () => {
      const access = await createGuestCart();
      const first = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0001')
        .send(aeDraft())
        .expect(200);
      const checkoutCookie = requireCookie(
        first.headers['set-cookie'],
        'hb_guest_checkout',
      );
      const authorizedHeaders = {
        ...access.mutationHeaders,
        Cookie: `${access.cartCookie}; ${checkoutCookie}`,
      };
      const expiresAt = (
        await prisma.checkoutDraft.findUniqueOrThrow({
          where: { cartId: access.cartId },
        })
      ).guestCapabilityExpiresAt;

      const recovered = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0001')
        .send(aeDraft())
        .expect(200);
      expect(recovered.body).toEqual(first.body);
      const recoveredCookie = requireCookie(
        recovered.headers['set-cookie'],
        'hb_guest_checkout',
      );
      expect(recoveredCookie.slice(recoveredCookie.indexOf('=') + 1)).toBe(
        checkoutCookie.slice(checkoutCookie.indexOf('=') + 1),
      );
      expect(await prisma.checkoutDraftRequest.count()).toBe(1);

      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0001')
        .send({ ...aeDraft(), fullName: 'Changed without checkout cookie' })
        .expect(409, { status: 'idempotency-conflict' });

      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-idempotent-without-capability')
        .send(aeDraft())
        .expect(401);

      const replay = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(authorizedHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0001')
        .send(aeDraft())
        .expect(200);
      expect(replay.body).toEqual(first.body);
      expect(replay.headers['set-cookie']).toBeUndefined();
      expect(await prisma.checkoutDraftRequest.count()).toBe(1);

      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(authorizedHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0001')
        .send({ ...aeDraft(), fullName: 'Changed input' })
        .expect(409, { status: 'idempotency-conflict' });

      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(authorizedHeaders)
        .set('Idempotency-Key', 'guest-idempotent-0002')
        .send({ ...aeDraft(), fullName: 'Updated name' })
        .expect(200);
      const updated = await prisma.checkoutDraft.findUniqueOrThrow({
        where: { cartId: access.cartId },
      });
      expect(updated.fullName).toBe('Updated name');
      expect(updated.guestCapabilityExpiresAt).toEqual(expiresAt);
      expect(updated.version).toBe(2);
      expect(await prisma.checkoutDraftRequest.count()).toBe(2);
    });

    it('returns one usable capability for concurrent identical guest starts', async () => {
      const access = await createGuestCart();
      const start = () =>
        request(app.getHttpServer() as App)
          .post('/api/v1/checkout/draft')
          .set(access.mutationHeaders)
          .set('Idempotency-Key', 'guest-concurrent-0001')
          .send(aeDraft())
          .expect(200);

      const [first, second] = await Promise.all([start(), start()]);
      const firstCookie = requireCookie(
        first.headers['set-cookie'],
        'hb_guest_checkout',
      );
      const secondCookie = requireCookie(
        second.headers['set-cookie'],
        'hb_guest_checkout',
      );
      expect(secondCookie).toBe(firstCookie);
      expect(second.body).toEqual(first.body);
      expect(await prisma.checkoutDraft.count()).toBe(1);
      expect(await prisma.checkoutDraftRequest.count()).toBe(1);

      const current = await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/draft')
        .set('Cookie', `${access.cartCookie}; ${firstCookie}`)
        .expect(200);
      const currentBody = current.body as CheckoutDraftDto;
      expect(currentBody).toEqual({
        ...(first.body as CheckoutDraftDto),
        quotedAt: currentBody.quotedAt,
      });
      expect(typeof currentBody.quotedAt).toBe('string');
    });

    it('replays the original POST quote while GET reports current canonical availability and price', async () => {
      const access = await createGuestCart();
      const first = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-quote-0001')
        .send(aeDraft())
        .expect(200);
      const checkoutCookie = requireCookie(
        first.headers['set-cookie'],
        'hb_guest_checkout',
      );
      expect(first.body).toMatchObject({
        currency: 'EUR',
        itemSubtotalMinor: 325,
        quoteStatus: 'ready',
        shippingMinor: 500,
        totalMinor: 825,
      });

      await prisma.product.update({
        data: { priceMinor: 425, stockAmount: 0 },
        where: { slug: productSlug },
      });

      const replay = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set({
          ...access.mutationHeaders,
          Cookie: `${access.cartCookie}; ${checkoutCookie}`,
        })
        .set('Idempotency-Key', 'guest-quote-0001')
        .send(aeDraft())
        .expect(200);
      expect(replay.body).toEqual(first.body);

      const current = await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/draft')
        .set('Cookie', `${access.cartCookie}; ${checkoutCookie}`)
        .expect(200);
      expect(current.body).toMatchObject({
        currency: 'EUR',
        itemSubtotalMinor: 425,
        quoteStatus: 'unavailable',
        shippingMinor: 500,
        totalMinor: 925,
      });
      expect(await productStock()).toBe(0);
      expect(await prisma.cartReservation.count()).toBe(0);
      expect(await prisma.order.count()).toBe(0);
    });

    it('fails closed for non-EUR data or a total outside the money boundary', async () => {
      const access = await createGuestCart();
      await prisma.product.update({
        data: { priceMinor: 2_147_483_647 },
        where: { slug: productSlug },
      });
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-quote-overflow-0001')
        .send(aeDraft())
        .expect(422, { status: 'quote-unavailable' });

      await prisma.product.update({
        data: { currency: 'USD', priceMinor: 325 },
        where: { slug: productSlug },
      });
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-quote-currency-0001')
        .send(aeDraft())
        .expect(422, { status: 'quote-unavailable' });

      expect(await prisma.checkoutDraft.count()).toBe(0);
      expect(await prisma.checkoutDraftRequest.count()).toBe(0);
      expect(await productStock()).toBe(100);
    });

    it('rejects anonymous COD before persistence', async () => {
      const access = await createGuestCart();
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-cod-0001')
        .send({ ...aeDraft(), paymentMethod: 'cash_on_delivery' })
        .expect(422, { status: 'payment-unavailable' });
      expect(await prisma.checkoutDraft.count()).toBe(0);
      expect(await prisma.order.count()).toBe(0);
      expect(await productStock()).toBe(100);
    });

    it('expires without disclosing PII and restarts with a rotated absolute capability', async () => {
      const access = await createGuestCart();
      const first = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(access.mutationHeaders)
        .set('Idempotency-Key', 'guest-expiry-0001')
        .send(aeDraft())
        .expect(200);
      const firstCookie = requireCookie(
        first.headers['set-cookie'],
        'hb_guest_checkout',
      );
      const firstRaw = firstCookie.slice(firstCookie.indexOf('=') + 1);
      const expiredCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1_000);
      await prisma.checkoutDraft.update({
        data: {
          createdAt: expiredCreatedAt,
          guestCapabilityExpiresAt: new Date(
            expiredCreatedAt.getTime() + 24 * 60 * 60 * 1_000,
          ),
        },
        where: { cartId: access.cartId },
      });

      const expired = await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/draft')
        .set('Cookie', `${access.cartCookie}; ${firstCookie}`)
        .expect(401);
      expect(JSON.stringify(expired.body)).not.toMatch(/ada|دبي|زايد/i);

      const restarted = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set({
          ...access.mutationHeaders,
          Cookie: `${access.cartCookie}; ${firstCookie}`,
        })
        .set('Idempotency-Key', 'guest-expiry-0002')
        .send({ ...aeDraft(), fullName: 'Restarted Guest' })
        .expect(200);
      const secondCookie = requireCookie(
        restarted.headers['set-cookie'],
        'hb_guest_checkout',
      );
      const secondRaw = secondCookie.slice(secondCookie.indexOf('=') + 1);
      expect(secondRaw).not.toBe(firstRaw);
      const stored = await prisma.checkoutDraft.findUniqueOrThrow({
        where: { cartId: access.cartId },
      });
      expect(Buffer.from(stored.guestCapabilityDigest!)).toEqual(
        hashCheckoutCapability(secondRaw),
      );
      expect(
        stored.guestCapabilityExpiresAt!.getTime() - stored.createdAt.getTime(),
      ).toBe(24 * 60 * 60 * 1_000);
      expect(await prisma.checkoutDraftRequest.count()).toBe(1);
    });

    it('keeps authenticated drafts session-owned and permits the existing COD choice', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'account@example.test',
          normalizedEmail: 'account@example.test',
        },
      });
      const cart = await prisma.cart.create({
        data: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
          tokenDigest: Uint8Array.from(hashCheckoutCapability('S'.repeat(43))),
          userId: user.id,
        },
      });
      const saved = await checkout.saveDraft(
        {
          cartId: cart.id,
          kind: 'account',
          rawToken: 'session-token',
          userId: user.id,
        },
        null,
        'account-draft-0001',
        {
          ...aeDraft(),
          paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
        },
      );
      expect(saved.issuedCapability).toBeUndefined();
      expect(saved.draft).toMatchObject({
        expiresAt: null,
        paymentMethod: 'cash_on_delivery',
      });
      expect(
        await prisma.checkoutDraft.findUniqueOrThrow({
          where: { cartId: cart.id },
        }),
      ).toMatchObject({
        guestCapabilityDigest: null,
        guestCapabilityExpiresAt: null,
        userId: user.id,
      });
    });

    it('purges only expired unassociated guest drafts and their replay snapshots', async () => {
      const expiredAccess = await createGuestCart();
      const expiredResponse = await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(expiredAccess.mutationHeaders)
        .set('Idempotency-Key', 'guest-purge-expired-0001')
        .send(aeDraft())
        .expect(200);
      expect((expiredResponse.body as CheckoutDraftDto).status).toBe(
        'pre_payment',
      );
      const expiredDraft = await prisma.checkoutDraft.findUniqueOrThrow({
        where: { cartId: expiredAccess.cartId },
      });
      const expiredCreatedAt = new Date(Date.now() - 48 * 60 * 60 * 1_000);
      expiredCreatedAt.setMilliseconds(0);
      await prisma.checkoutDraft.update({
        data: {
          createdAt: expiredCreatedAt,
          guestCapabilityExpiresAt: new Date(
            expiredCreatedAt.getTime() + 24 * 60 * 60 * 1_000,
          ),
        },
        where: { id: expiredDraft.id },
      });

      const activeAccess = await createGuestCart();
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout/draft')
        .set(activeAccess.mutationHeaders)
        .set('Idempotency-Key', 'guest-purge-active-0001')
        .send(aeDraft())
        .expect(200);

      const historicalUser = await prisma.user.create({
        data: {
          email: 'historical-purge@example.test',
          normalizedEmail: 'historical-purge@example.test',
        },
      });
      const historicalCart = await prisma.cart.create({
        data: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
          tokenDigest: Uint8Array.from(hashCheckoutCapability('T'.repeat(43))),
          userId: historicalUser.id,
        },
      });
      await prisma.order.create({
        data: {
          cartId: historicalCart.id,
          city: 'Berlin',
          currency: 'EUR',
          fullName: 'Historical Customer',
          idempotencyKey: 'historical-purge-order-0001',
          itemSubtotalMinor: 0,
          paymentMethod: 'CASH_ON_DELIVERY',
          paymentState: 'DUE_ON_DELIVERY',
          phoneNumber: '+49 30 123456',
          placedAt: new Date(),
          requestHash: Uint8Array.from(Buffer.alloc(32, 0x44)),
          shippingAddress: 'Historical Street 1',
          shippingMinor: 500,
          status: 'PLACED',
          totalMinor: 500,
          userId: historicalUser.id,
        },
      });
      const associatedCreatedAt = new Date(Date.now() - 48 * 60 * 60 * 1_000);
      associatedCreatedAt.setMilliseconds(0);
      const associatedDraft = await prisma.checkoutDraft.create({
        data: {
          cartId: historicalCart.id,
          city: 'Berlin',
          countryCode: 'DE',
          createdAt: associatedCreatedAt,
          email: 'historical-purge@example.test',
          fullName: 'Historical Customer',
          guestCapabilityDigest: Uint8Array.from(Buffer.alloc(32, 0x55)),
          guestCapabilityExpiresAt: new Date(
            associatedCreatedAt.getTime() + 24 * 60 * 60 * 1_000,
          ),
          paymentMethod: 'STRIPE_DEBIT_CARD',
          phoneNumber: '+49 30 123456',
          postalCode: '10115',
          street: 'Historical Street',
        },
      });
      await prisma.checkoutDraftRequest.create({
        data: {
          checkoutDraftId: associatedDraft.id,
          idempotencyKey: 'associated-draft-request-0001',
          requestHash: Uint8Array.from(Buffer.alloc(32, 0x66)),
          responseSnapshot: { status: 'pre_payment' },
        },
      });

      const cartsBefore = await prisma.cart.count();
      await expect(
        checkout.purgeExpiredGuestDrafts(new Date(), 1),
      ).resolves.toEqual({ purgedDraftCount: 1 });
      await expect(
        checkout.purgeExpiredGuestDrafts(new Date(), 1),
      ).resolves.toEqual({ purgedDraftCount: 0 });

      expect(
        await prisma.checkoutDraft.findUnique({
          where: { id: expiredDraft.id },
        }),
      ).toBeNull();
      expect(
        await prisma.checkoutDraftRequest.count({
          where: { checkoutDraftId: expiredDraft.id },
        }),
      ).toBe(0);
      expect(
        await prisma.checkoutDraft.count({
          where: {
            id: { in: [associatedDraft.id] },
          },
        }),
      ).toBe(1);
      expect(
        await prisma.checkoutDraft.count({
          where: { cartId: activeAccess.cartId },
        }),
      ).toBe(1);
      expect(await prisma.cart.count()).toBe(cartsBefore);
      expect(await prisma.order.count()).toBe(1);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.checkoutDraftRequest.count()).toBe(2);
    });

    async function createGuestCart() {
      const created = await request(app.getHttpServer() as App)
        .post('/api/v1/cart/items')
        .set('Origin', 'http://localhost:3000')
        .send({ amount: 1, productSlug })
        .expect(200);
      const cartCookie = requireCookie(
        created.headers['set-cookie'],
        'hb_cart',
      );
      const csrfResponse = await request(app.getHttpServer() as App)
        .get('/api/v1/cart/csrf')
        .set('Cookie', cartCookie)
        .expect(200);
      const cart = await prisma.cart.findFirstOrThrow({
        orderBy: { createdAt: 'desc' },
      });
      return {
        cartCookie,
        cartId: cart.id,
        mutationHeaders: {
          Cookie: cartCookie,
          Origin: 'http://localhost:3000',
          'X-CSRF-Token': (csrfResponse.body as { csrfToken: string })
            .csrfToken,
        },
      };
    }

    async function productStock(): Promise<number> {
      return (
        await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } })
      ).stockAmount;
    }
  },
);

function aeDraft() {
  return {
    delivery: {
      city: 'دبي',
      countryCode: 'AE',
      street: 'شارع الشيخ زايد',
    },
    email: 'Ada@Example.COM',
    fullName: 'آدا برور',
    paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
    phoneNumber: '+971 50 123 4567',
  };
}

function requireCookie(
  header: string | string[] | undefined,
  cookieName: string,
): string {
  const values = typeof header === 'string' ? [header] : header;
  const cookie = values?.find((candidate) =>
    candidate.startsWith(`${cookieName}=`),
  );
  if (!cookie) throw new Error(`Expected ${cookieName} cookie`);
  return cookie.split(';', 1)[0];
}
