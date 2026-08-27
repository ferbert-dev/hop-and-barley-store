import { UnprocessableEntityException } from '@nestjs/common';
import { Client } from 'pg';
import {
  consumeCartReservations,
  reservationClock,
} from '../src/cart/cart-reservation';
import type { ActiveCartCapability } from '../src/cart/cart-request';
import { CartService } from '../src/cart/cart.service';
import { hashCartToken } from '../src/cart/cart-token';
import { PrismaService } from '../src/database/prisma.service';

const describePostgres =
  process.env.RUN_O1B_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const alphaSlug = 'o1b-alpha';
const betaSlug = 'o1b-beta';
const baseNow = new Date('2026-08-25T12:00:00.000Z');

describePostgres(
  'O1B cart reservations with disposable PostgreSQL 17.6',
  () => {
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
        [alphaSlug, 'O1B Alpha'],
        [betaSlug, 'O1B Beta'],
      ] as const) {
        await prisma.product.upsert({
          create: {
            amountUnit: 'EACH',
            categoryId: category.id,
            currency: 'USD',
            description: 'O1B disposable reservation fixture',
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
            teaser: 'O1B fixture',
          },
          update: { currency: 'USD', isActive: true, stockAmount: 10 },
          where: { slug },
        });
      }
    });

    beforeEach(async () => {
      await prisma.cartReservation.deleteMany();
      await prisma.cartItem.deleteMany();
      await prisma.cart.deleteMany();
      await prisma.product.updateMany({
        data: { currency: 'USD', isActive: true, stockAmount: 10 },
        where: { slug: { in: [alphaSlug, betaSlug] } },
      });
    });

    afterAll(async () => {
      await prisma.cartReservation.deleteMany();
      await prisma.cartItem.deleteMany();
      await prisma.cart.deleteMany();
      await prisma.product.deleteMany({
        where: { slug: { in: [alphaSlug, betaSlug] } },
      });
      await prisma.$disconnect();
      await postgres.end();
    });

    it('stores exactly 15 minutes and rejects inexact create/add/update without renewing the hold', async () => {
      await setStock(alphaSlug, 3);
      await expect(
        carts.createAndAdd({ productSlug: alphaSlug, amount: 5 }, baseNow),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      const first = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 3 },
        baseNow,
      );
      const firstCapability = await requireCapability(first.rawToken, baseNow);
      expect(first.cart).toMatchObject({
        adjustmentMessage: null,
        serverNow: baseNow.toISOString(),
      });
      expect(first.cart.items[0]).toMatchObject({
        amount: 3,
        reservationExpiresAt: '2026-08-25T12:15:00.000Z',
        reservationStatus: 'active',
      });
      const firstItem = await itemFor(firstCapability, alphaSlug);
      const firstReservation = await prisma.cartReservation.findUniqueOrThrow({
        where: { id: requiredId(firstItem.currentReservationId) },
      });
      expect(
        firstReservation.expiresAt.getTime() -
          firstReservation.reservedAt.getTime(),
      ).toBe(15 * 60 * 1_000);

      await carts.remove(firstCapability, alphaSlug, atMinutes(1));
      await setStock(alphaSlug, 5);
      const added = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 2 },
        atMinutes(2),
      );
      const addCapability = await requireCapability(
        added.rawToken,
        atMinutes(2),
      );
      const beforeAdd = await itemFor(addCapability, alphaSlug);
      const addResult = await carts.add(
        addCapability,
        { productSlug: alphaSlug, amount: 3 },
        atMinutes(4),
      );
      const afterAdd = await itemFor(addCapability, alphaSlug);
      expect(addResult).toMatchObject({
        adjustmentMessage: null,
        items: [{ amount: 5, reservationStatus: 'active' }],
      });
      expect(afterAdd.currentReservationId).not.toBe(
        beforeAdd.currentReservationId,
      );
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: requiredId(afterAdd.currentReservationId) },
        }),
      ).toMatchObject({ expiresAt: atMinutes(19), amount: 5 });

      const beforeNoop = afterAdd.currentReservationId;
      await expect(
        carts.add(
          addCapability,
          { productSlug: alphaSlug, amount: 1 },
          atMinutes(5),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(
        (await itemFor(addCapability, alphaSlug)).currentReservationId,
      ).toBe(beforeNoop);

      await carts.remove(addCapability, alphaSlug, atMinutes(6));
      await setStock(alphaSlug, 4);
      const updated = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 2 },
        atMinutes(7),
      );
      const updateCapability = await requireCapability(
        updated.rawToken,
        atMinutes(7),
      );
      const beforeRejectedUpdate = await itemFor(updateCapability, alphaSlug);
      await expect(
        carts.update(updateCapability, alphaSlug, { amount: 8 }, atMinutes(9)),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: {
            id: requiredId(
              (await itemFor(updateCapability, alphaSlug)).currentReservationId,
            ),
          },
        }),
      ).toMatchObject({
        expiresAt: atMinutes(22),
        id: beforeRejectedUpdate.currentReservationId,
        amount: 2,
      });

      await carts.remove(updateCapability, alphaSlug, atMinutes(10));
      await setStock(alphaSlug, 100);
      const capped = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 90 },
        atMinutes(11),
      );
      const cappedCapability = await requireCapability(
        capped.rawToken,
        atMinutes(11),
      );
      await expect(
        carts.add(
          cappedCapability,
          { productSlug: alphaSlug, amount: 20 },
          atMinutes(12),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect((await itemFor(cappedCapability, alphaSlug)).amount).toBe(90);
    });

    it('serializes parallel carts so successful active reservations never exceed stock', async () => {
      await setStock(alphaSlug, 5);
      const attempts = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          carts.createAndAdd({ productSlug: alphaSlug, amount: 3 }, baseNow),
        ),
      );
      expect(
        attempts.filter(({ status }) => status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        attempts.filter(({ status }) => status === 'rejected'),
      ).toHaveLength(2);
      const active = await prisma.cartReservation.aggregate({
        _sum: { amount: true },
        where: {
          expiresAt: { gt: baseNow },
          product: { slug: alphaSlug },
          status: 'ACTIVE',
        },
      });
      expect(active._sum.amount).toBe(3);
      expect(
        attempts
          .filter(
            (attempt): attempt is PromiseRejectedResult =>
              attempt.status === 'rejected',
          )
          .every(
            ({ reason }) => reason instanceof UnprocessableEntityException,
          ),
      ).toBe(true);
    });

    it('releases decrease delta without extension and preserves RELEASED history on remove and clear', async () => {
      const created = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 4 },
        baseNow,
      );
      const capability = await requireCapability(created.rawToken, baseNow);
      const before = await itemFor(capability, alphaSlug);
      const beforeReservationId = requiredId(before.currentReservationId);
      const decreased = await carts.update(
        capability,
        alphaSlug,
        { amount: 2 },
        atMinutes(5),
      );
      expect(decreased.items[0]).toMatchObject({
        amount: 2,
        reservationExpiresAt: '2026-08-25T12:15:00.000Z',
      });
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: beforeReservationId },
        }),
      ).toMatchObject({
        expiresAt: atMinutes(15),
        amount: 2,
        releasedAt: null,
        status: 'ACTIVE',
      });

      await carts.remove(capability, alphaSlug, atMinutes(6));
      expect(
        await prisma.cartItem.count({ where: { cartId: capability.cartId } }),
      ).toBe(0);
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: beforeReservationId },
        }),
      ).toMatchObject({
        cartItemId: null,
        amount: 2,
        releasedAt: atMinutes(6),
        status: 'RELEASED',
      });

      await carts.add(
        capability,
        { productSlug: alphaSlug, amount: 2 },
        atMinutes(7),
      );
      await carts.add(
        capability,
        { productSlug: betaSlug, amount: 3 },
        atMinutes(8),
      );
      const activeIds = (
        await prisma.cartReservation.findMany({
          select: { id: true },
          where: { cartId: capability.cartId, status: 'ACTIVE' },
        })
      ).map(({ id }) => id);
      const cleared = await carts.clear(capability, atMinutes(9));
      expect(cleared.items).toHaveLength(0);
      expect(
        await prisma.cartReservation.count({
          where: {
            cartItemId: null,
            id: { in: activeIds },
            releasedAt: atMinutes(9),
            status: 'RELEASED',
          },
        }),
      ).toBe(2);
    });

    it('retains an expired desired line, makes exact-boundary stock reusable, then rechecks zero and fresh availability', async () => {
      await setStock(alphaSlug, 3);
      const first = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 3 },
        baseNow,
      );
      const firstCapability = await requireCapability(first.rawToken, baseNow);
      const firstReservationId = requiredId(
        (await itemFor(firstCapability, alphaSlug)).currentReservationId,
      );
      const expired = await carts.getCart(firstCapability, atMinutes(15));
      expect(expired.items[0]).toMatchObject({
        availability: 'unavailable',
        amount: 3,
        reservationExpiresAt: atMinutes(15).toISOString(),
        reservationStatus: 'expired',
      });

      const second = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 3 },
        atMinutes(15),
      );
      const secondCapability = await requireCapability(
        second.rawToken,
        atMinutes(15),
      );
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: firstReservationId },
        }),
      ).toMatchObject({ status: 'EXPIRED' });

      const unavailable = await carts.recheck(firstCapability, atMinutes(16));
      expect(unavailable).toMatchObject({
        adjustmentMessage: 'Out-of-stock items could not be reserved.',
        checkoutEligible: false,
        items: [
          {
            availability: 'unavailable',
            amount: 3,
            reservationExpiresAt: null,
            reservationStatus: 'unreserved',
          },
        ],
      });
      expect(
        (await itemFor(firstCapability, alphaSlug)).currentReservationId,
      ).toBeNull();

      await carts.remove(secondCapability, alphaSlug, atMinutes(17));
      const refreshed = await carts.recheck(firstCapability, atMinutes(18));
      expect(refreshed).toMatchObject({
        adjustmentMessage: null,
        checkoutEligible: true,
        items: [
          {
            amount: 3,
            reservationExpiresAt: atMinutes(33).toISOString(),
            reservationStatus: 'active',
          },
        ],
      });
    });

    it('rechecks all lines in one operation, clamps positive availability and retains zero stock unreserved', async () => {
      await setStock(alphaSlug, 3);
      await setStock(betaSlug, 0);
      const capability = await createUnreservedCart([
        [alphaSlug, 5],
        [betaSlug, 5],
      ]);

      const rechecked = await carts.recheck(capability, baseNow);

      expect(rechecked.adjustmentMessage).toBe(
        'Some quantities were reduced, and out-of-stock items could not be reserved.',
      );
      expect(rechecked.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            productSlug: alphaSlug,
            amount: 3,
            reservationExpiresAt: atMinutes(15).toISOString(),
            reservationStatus: 'active',
          }),
          expect.objectContaining({
            availability: 'unavailable',
            productSlug: betaSlug,
            amount: 5,
            reservationExpiresAt: null,
            reservationStatus: 'unreserved',
          }),
        ]),
      );
      expect(rechecked.checkoutEligible).toBe(false);
      expect(
        await prisma.cartItem.count({ where: { cartId: capability.cartId } }),
      ).toBe(2);
    });

    it('consumes a named active reservation exactly once and detached EXPIRED/CONSUMED history survives removal', async () => {
      await setStock(alphaSlug, 5);
      const consumedCart = await carts.createAndAdd(
        { productSlug: alphaSlug, amount: 2 },
        baseNow,
      );
      const consumedCapability = await requireCapability(
        consumedCart.rawToken,
        baseNow,
      );
      const consumedId = requiredId(
        (await itemFor(consumedCapability, alphaSlug)).currentReservationId,
      );

      const consume = () =>
        prisma.$transaction(
          (transaction) =>
            consumeCartReservations(transaction, [consumedId], atMinutes(5)),
          { isolationLevel: 'Serializable', maxWait: 2_000, timeout: 5_000 },
        );
      await expect(consume()).resolves.toEqual([
        expect.objectContaining({ amount: 2, reservationId: consumedId }),
      ]);
      await expect(consume()).resolves.toEqual([
        expect.objectContaining({ amount: 2, reservationId: consumedId }),
      ]);
      expect(
        await prisma.product.findUniqueOrThrow({ where: { slug: alphaSlug } }),
      ).toMatchObject({ stockAmount: 3 });
      await carts.remove(consumedCapability, alphaSlug, atMinutes(6));
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: consumedId },
        }),
      ).toMatchObject({ cartItemId: null, status: 'CONSUMED' });

      const expiredCart = await carts.createAndAdd(
        { productSlug: betaSlug, amount: 1 },
        baseNow,
      );
      const expiredCapability = await requireCapability(
        expiredCart.rawToken,
        baseNow,
      );
      const expiredId = requiredId(
        (await itemFor(expiredCapability, betaSlug)).currentReservationId,
      );
      await carts.remove(expiredCapability, betaSlug, atMinutes(15));
      expect(
        await prisma.cartReservation.findUniqueOrThrow({
          where: { id: expiredId },
        }),
      ).toMatchObject({ cartItemId: null, status: 'EXPIRED' });
    });

    it('enforces SQL lifetime, state and one-active-reservation constraints', async () => {
      const capability = await createUnreservedCart([[alphaSlug, 1]]);
      const item = await itemFor(capability, alphaSlug);
      const product = await prisma.product.findUniqueOrThrow({
        where: { slug: alphaSlug },
      });
      await expect(
        postgres.query(
          `INSERT INTO "CartReservation" ("cartId", "cartItemId", "productId", "amount", "status", "reservedAt", "expiresAt", "updatedAt") VALUES ($1, $2, $3, 1, 'ACTIVE', $4::timestamp, $4::timestamp + interval '14 minutes', $4::timestamp)`,
          [capability.cartId, item.id, product.id, baseNow],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      const clock = reservationClock(baseNow);
      await prisma.cartReservation.create({
        data: {
          cartId: capability.cartId,
          cartItemId: item.id,
          expiresAt: clock.expiresAt,
          productId: product.id,
          amount: 1,
          reservedAt: clock.reservedAt,
        },
      });
      await expect(
        prisma.cartReservation.create({
          data: {
            cartId: capability.cartId,
            cartItemId: item.id,
            expiresAt: clock.expiresAt,
            productId: product.id,
            amount: 1,
            reservedAt: clock.reservedAt,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        postgres.query(
          `INSERT INTO "CartReservation" ("cartId", "productId", "amount", "status", "reservedAt", "expiresAt", "updatedAt") VALUES ($1, $2, 1, 'ACTIVE', $3::timestamp, $3::timestamp + interval '15 minutes', $3::timestamp)`,
          [capability.cartId, product.id, baseNow],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    async function setStock(slug: string, stockAmount: number): Promise<void> {
      await prisma.product.update({ data: { stockAmount }, where: { slug } });
    }

    async function requireCapability(
      rawToken: string,
      now: Date,
    ): Promise<ActiveCartCapability> {
      const capability = await carts.authenticate(rawToken, now);
      if (!capability) throw new Error('Expected active cart capability');
      return capability;
    }

    async function itemFor(capability: ActiveCartCapability, slug: string) {
      return prisma.cartItem.findFirstOrThrow({
        where: { cartId: capability.cartId, product: { slug } },
      });
    }

    async function createUnreservedCart(
      lines: ReadonlyArray<readonly [string, number]>,
    ): Promise<ActiveCartCapability> {
      const rawToken = `U${String(await prisma.cart.count()).padStart(42, 'A')}`;
      const cart = await prisma.cart.create({
        data: {
          expiresAt: new Date('2026-09-24T12:00:00.000Z'),
          tokenDigest: Uint8Array.from(hashCartToken(rawToken)),
        },
      });
      for (const [slug, amount] of lines) {
        const product = await prisma.product.findUniqueOrThrow({
          where: { slug },
        });
        await prisma.cartItem.create({
          data: { cartId: cart.id, productId: product.id, amount },
        });
      }
      return { cartId: cart.id, expiresAt: cart.expiresAt, rawToken };
    }
  },
);

function atMinutes(minutes: number): Date {
  return new Date(baseNow.getTime() + minutes * 60 * 1_000);
}

function requiredId(id: string | null): string {
  if (!id) throw new Error('Expected current reservation id');
  return id;
}
