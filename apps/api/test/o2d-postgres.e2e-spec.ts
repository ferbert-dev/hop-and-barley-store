import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutPaymentMethod } from '../src/orders/dto/create-order.dto';
import { PrismaService } from '../src/database/prisma.service';
import type { Prisma } from '../src/generated/prisma/client';
import {
  markPaymentAttemptSucceeded,
  PaymentAttemptService,
  type StoredPaymentAttempt,
} from '../src/payments/payment-attempt.service';

const describePostgres =
  process.env.RUN_O2D_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const productSlug = 'safale-us05-yeast';
let fixtureSequence = 0;

describePostgres('O2D discount claims with disposable PostgreSQL', () => {
  let app: INestApplication;
  let attempts: PaymentAttemptService;
  let checkout: CheckoutService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    attempts = app.get(PaymentAttemptService);
    checkout = app.get(CheckoutService);
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "FirstPurchaseDiscountClaim",
        "OrderItem",
        "Order",
        "PaymentAttemptItem",
        "PaymentAttempt",
        "CheckoutDraftRequest",
        "CheckoutDraft",
        "CartItem",
        "Cart",
        "User"
      CASCADE
    `);
    await prisma.product.update({
      data: {
        currency: 'EUR',
        isActive: true,
        priceMinor: 10_000,
        stockAmount: 100,
      },
      where: { slug: productSlug },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('claims 6% once and stores immutable product, delivery, and financial snapshots', async () => {
    const fixture = await createDraft('eligible', 'account');
    const stockBefore = await productStock();
    const attempt = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-eligible-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });

    expect(attempt).toMatchObject({
      checkoutDraftVersion: 1,
      currency: 'EUR',
      discountBasisPoints: 600,
      discountKind: 'FIRST_PURCHASE',
      discountMinor: 600,
      discountPolicyVersion: 'registered-first-purchase-v1',
      itemSubtotalMinor: 10_000,
      shippingMinor: 500,
      status: 'PREPARED',
      totalMinor: 9_900,
      userId: fixture.userId,
    });
    expect(attempt.items).toHaveLength(1);
    expect(attempt.items[0]).toMatchObject({
      amount: 1,
      lineTotalMinor: 10_000,
      priceMinor: 10_000,
      productSlug,
    });
    expect(await prisma.firstPurchaseDiscountClaim.count()).toBe(1);
    expect(await productStock()).toBe(stockBefore);
    expect(await prisma.order.count()).toBe(0);

    await prisma.product.update({
      data: { priceMinor: 20_000 },
      where: { slug: productSlug },
    });
    await expect(
      checkout.getDraft(
        {
          cartId: fixture.cartId,
          kind: 'account',
          rawToken: 'session-token',
          userId: fixture.userId!,
        },
        null,
      ),
    ).resolves.toMatchObject({
      discountMinor: 600,
      itemSubtotalMinor: 10_000,
      totalMinor: 9_900,
    });
    await expect(
      checkout.saveDraft(
        {
          cartId: fixture.cartId,
          kind: 'account',
          rawToken: 'session-token',
          userId: fixture.userId!,
        },
        null,
        'o2d-active-attempt-edit-0001',
        {
          delivery: {
            city: 'Berlin',
            countryCode: 'DE',
            postalCode: '10115',
            street: 'Changed Street',
          },
          email: 'eligible@example.test',
          fullName: 'Changed Customer',
          paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
          phoneNumber: '+49 30 123456',
        },
      ),
    ).rejects.toMatchObject({
      response: { status: 'discount-claim-held' },
    });

    await expect(
      prisma.paymentAttempt.update({
        data: { totalMinor: 1 },
        where: { id: attempt.id },
      }),
    ).rejects.toThrow(/immutable snapshot/i);
    await expect(
      prisma.paymentAttemptItem.update({
        data: { amount: 2 },
        where: { id: (await prisma.paymentAttemptItem.findFirstOrThrow()).id },
      }),
    ).rejects.toThrow(/immutable snapshot/i);
    await expect(
      prisma.paymentAttemptItem.create({
        data: {
          ...attempt.items[0],
          paymentAttemptId: attempt.id,
        },
      }),
    ).rejects.toThrow(/cannot be added after snapshot seal/i);
    await expect(
      prisma.paymentAttemptItem.delete({
        where: { id: (await prisma.paymentAttemptItem.findFirstOrThrow()).id },
      }),
    ).rejects.toThrow(/cannot be changed or deleted/i);
    await expect(
      prisma.paymentAttempt.delete({ where: { id: attempt.id } }),
    ).rejects.toThrow(/history cannot be deleted/i);
    await expect(
      prisma.firstPurchaseDiscountClaim.update({
        data: {
          releaseReason: 'DEFINITIVE_PAYMENT_FAILED',
          releasedAt: new Date(),
          status: 'RELEASED',
        },
        where: { paymentAttemptId: attempt.id },
      }),
    ).rejects.toThrow(/cannot release before a definitive unpaid outcome/i);
    await expect(
      prisma.firstPurchaseDiscountClaim.delete({
        where: { paymentAttemptId: attempt.id },
      }),
    ).rejects.toThrow(/history cannot be deleted/i);
    await expect(
      prisma.paymentAttempt.create({
        data: rawPaymentAttemptData(
          fixture,
          attempt,
          'o2d-unsealed-attempt-0001',
          'NONE',
        ),
      }),
    ).rejects.toThrow(/must be sealed before commit/i);
    await expect(
      prisma.paymentAttempt.create({
        data: {
          ...rawPaymentAttemptData(
            fixture,
            attempt,
            'o2d-presealed-attempt-0001',
            'NONE',
          ),
          snapshotSealedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/seal must be established by guarded transition/i);
    await expect(
      prisma.paymentAttempt.update({
        data: {
          definitivelyFailedAt: new Date(),
          status: 'DEFINITIVELY_FAILED',
        },
        where: { id: attempt.id },
      }),
    ).rejects.toThrow(/must release its claim/i);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'PREPARED' });
  });

  it('never discounts guests or accounts with a completed paid purchase', async () => {
    const guest = await createDraft('guest', 'guest');
    const guestAttempt = await attempts.prepare({
      checkoutDraftId: guest.draftId,
      idempotencyKey: 'o2d-guest-attempt-0001',
      principal: { kind: 'guest' },
    });
    expect(guestAttempt).toMatchObject({
      discountBasisPoints: 0,
      discountKind: 'NONE',
      discountMinor: 0,
      totalMinor: 10_500,
      userId: null,
    });

    const returning = await createDraft('returning', 'account');
    await createHistoricalPaidOrder(returning.userId!);
    const returningAttempt = await attempts.prepare({
      checkoutDraftId: returning.draftId,
      idempotencyKey: 'o2d-returning-attempt-0001',
      principal: { kind: 'account', userId: returning.userId! },
    });
    expect(returningAttempt).toMatchObject({
      discountBasisPoints: 0,
      discountKind: 'NONE',
      discountMinor: 0,
      totalMinor: 10_500,
    });
    expect(await prisma.firstPurchaseDiscountClaim.count()).toBe(0);
  });

  it('replays one immutable attempt and rejects a changed draft under the same key', async () => {
    const fixture = await createDraft('replay', 'account');
    const input = {
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-replay-attempt-0001',
      principal: { kind: 'account' as const, userId: fixture.userId! },
    };
    const first = await attempts.prepare(input);
    await prisma.product.update({
      data: { priceMinor: 20_000 },
      where: { slug: productSlug },
    });
    await expect(attempts.prepare(input)).resolves.toEqual(first);

    await prisma.checkoutDraft.update({
      data: { fullName: 'Changed Name', version: { increment: 1 } },
      where: { id: fixture.draftId },
    });
    await expect(attempts.prepare(input)).rejects.toMatchObject({
      response: { status: 'idempotency-conflict' },
    });
  });

  it('upgrades a complete pre-O2D replay snapshot without repricing it', async () => {
    const fixture = await createDraft('legacy-replay', 'account');
    const input = {
      delivery: {
        city: 'Berlin',
        countryCode: 'DE',
        postalCode: '10115',
        street: 'O2D Street',
      },
      email: `legacy-replay-${fixtureSequence}@example.test`,
      fullName: 'O2D Customer',
      paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
      phoneNumber: '+49 30 123456',
    };
    await checkout.saveDraft(
      {
        cartId: fixture.cartId,
        kind: 'account',
        rawToken: 'session-token',
        userId: fixture.userId!,
      },
      null,
      'o2d-legacy-replay-0001',
      input,
    );
    const request = await prisma.checkoutDraftRequest.findFirstOrThrow({
      where: { idempotencyKey: 'o2d-legacy-replay-0001' },
    });
    const stored = request.responseSnapshot as Record<string, unknown>;
    const preO2d = { ...stored };
    delete preO2d.discountBasisPoints;
    delete preO2d.discountMinor;
    delete preO2d.discountPolicyVersion;
    await prisma.checkoutDraftRequest.update({
      data: {
        responseSnapshot: {
          ...preO2d,
          itemSubtotalMinor: 10_000,
          shippingMinor: 500,
          totalMinor: 10_500,
        },
      },
      where: { id: request.id },
    });

    await expect(
      checkout.saveDraft(
        {
          cartId: fixture.cartId,
          kind: 'account',
          rawToken: 'session-token',
          userId: fixture.userId!,
        },
        null,
        'o2d-legacy-replay-0001',
        input,
      ),
    ).resolves.toMatchObject({
      draft: {
        discountBasisPoints: 0,
        discountMinor: 0,
        discountPolicyVersion: 'no-discount-v1',
        itemSubtotalMinor: 10_000,
        shippingMinor: 500,
        totalMinor: 10_500,
      },
    });

    await prisma.checkoutDraftRequest.update({
      data: {
        responseSnapshot: {
          ...preO2d,
          discountMinor: 0,
          itemSubtotalMinor: 10_000,
          shippingMinor: 500,
          totalMinor: 10_500,
        },
      },
      where: { id: request.id },
    });
    await expect(
      checkout.saveDraft(
        {
          cartId: fixture.cartId,
          kind: 'account',
          rawToken: 'session-token',
          userId: fixture.userId!,
        },
        null,
        'o2d-legacy-replay-0001',
        input,
      ),
    ).rejects.toMatchObject({ response: { status: 'quote-unavailable' } });
  });

  it('serializes concurrent claims and retains the winner through an ambiguous outcome', async () => {
    const fixture = await createDraft('concurrent', 'account');
    const prepare = (idempotencyKey: string) =>
      attempts.prepare({
        checkoutDraftId: fixture.draftId,
        idempotencyKey,
        principal: { kind: 'account', userId: fixture.userId! },
      });
    const outcomes = await Promise.allSettled([
      prepare('o2d-concurrent-attempt-0001'),
      prepare('o2d-concurrent-attempt-0002'),
    ]);
    const winner = outcomes.find(
      (
        outcome,
      ): outcome is PromiseFulfilledResult<
        Awaited<ReturnType<typeof prepare>>
      > => outcome.status === 'fulfilled',
    );
    const loser = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );
    expect(winner).toBeDefined();
    expect(loser?.reason).toBeInstanceOf(ConflictException);
    expect(loser?.reason).toMatchObject({
      response: { status: 'discount-claim-held' },
    });
    expect(
      await prisma.firstPurchaseDiscountClaim.count({
        where: { status: 'CLAIMED' },
      }),
    ).toBe(1);

    await expect(
      createSealedAttemptAndInsertClaim(
        fixture,
        winner!.value,
        'o2d-direct-duplicate-0001',
        'CLAIMED',
      ),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      createSealedAttemptAndInsertClaim(
        fixture,
        winner!.value,
        'o2d-direct-terminal-0001',
        'RELEASED',
      ),
    ).rejects.toThrow(/requires one sealed eligible attempt/i);

    await attempts.markReconciliationRequired(winner!.value.id);
    await attempts.markPending(
      winner!.value.id,
      'late-provider-resolution-0001',
    );
    await expect(prepare('o2d-concurrent-attempt-0003')).rejects.toMatchObject({
      response: { status: 'discount-claim-held' },
    });
    expect(
      await prisma.firstPurchaseDiscountClaim.findFirstOrThrow({
        select: { releasedAt: true, status: true },
      }),
    ).toEqual({ releasedAt: null, status: 'CLAIMED' });
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: winner!.value.id },
      }),
    ).toMatchObject({
      providerPaymentReference: 'late-provider-resolution-0001',
      status: 'PENDING',
    });
    await attempts.markReconciliationRequired(winner!.value.id);
    await expect(
      attempts.markPending(winner!.value.id, 'replacement-reference-0001'),
    ).rejects.toMatchObject({
      response: { status: 'payment-attempt-unavailable' },
    });
    await expect(
      prisma.paymentAttempt.update({
        data: { providerPaymentReference: 'replacement-reference-0001' },
        where: { id: winner!.value.id },
      }),
    ).rejects.toThrow(/provider reference cannot be changed/i);
  });

  it('releases only a definitive unpaid outcome and permits a later claim', async () => {
    const fixture = await createDraft('release', 'account');
    const first = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-release-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    await attempts.releaseDefinitiveOutcome(first.id, 'failed');
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        where: { paymentAttemptId: first.id },
      }),
    ).toMatchObject({
      releaseReason: 'DEFINITIVE_PAYMENT_FAILED',
      status: 'RELEASED',
    });

    const second = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-release-attempt-0002',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    expect(second.discountKind).toBe('FIRST_PURCHASE');
    expect(await prisma.firstPurchaseDiscountClaim.count()).toBe(2);
  });

  it('serializes competing definitive outcomes and keeps one matching terminal pair', async () => {
    const fixture = await createDraft('terminal-race', 'account');
    const attempt = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-terminal-race-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    const outcomes = await Promise.allSettled([
      attempts.releaseDefinitiveOutcome(attempt.id, 'failed'),
      attempts.releaseDefinitiveOutcome(attempt.id, 'cancelled_unpaid'),
    ]);
    expect(
      outcomes.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
    const [storedAttempt, claim] = await Promise.all([
      prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
      prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        select: { releaseReason: true, status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ]);
    expect(claim.status).toBe('RELEASED');
    expect([
      {
        releaseReason: 'DEFINITIVE_PAYMENT_FAILED',
        status: 'DEFINITIVELY_FAILED',
      },
      {
        releaseReason: 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID',
        status: 'CANCELLED',
      },
    ]).toContainEqual({
      releaseReason: claim.releaseReason,
      status: storedAttempt.status,
    });
  });

  it('consumes a successful exact-match order once even if the account becomes disabled', async () => {
    const fixture = await createDraft('success', 'account');
    const attempt = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-success-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    await attempts.markPending(attempt.id, 'provider-o2d-success-0001');
    const order = await settlePaidOrderForAttempt(
      fixture,
      attempt,
      'provider-o2d-success-0001',
      attempt.items,
    );
    await prisma.user.update({
      data: { status: 'DISABLED' },
      where: { id: fixture.userId! },
    });

    await expect(
      prisma.$transaction((transaction) =>
        markPaymentAttemptSucceeded(
          transaction,
          attempt.id,
          order.id,
          new Date(),
        ),
      ),
    ).resolves.toBeUndefined();
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        where: { paymentAttemptId: attempt.id },
      }),
    ).toMatchObject({ consumedOrderId: order.id, status: 'CONSUMED' });
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
    ).toMatchObject({ status: 'SUCCEEDED' });
    await expect(
      prisma.order.update({
        data: { providerPaymentReference: 'provider-replacement-0001' },
        where: { id: order.id },
      }),
    ).rejects.toThrow(/requires its exact paid order/i);
    await expect(
      prisma.orderItem.update({
        data: { productName: 'Changed settled item' },
        where: { id: (await prisma.orderItem.findFirstOrThrow()).id },
      }),
    ).rejects.toThrow(/requires its exact paid order/i);
  });

  it('rejects success when the paid order has a different provider reference', async () => {
    const fixture = await createDraft('provider-mismatch', 'account');
    const attempt = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-provider-mismatch-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    await attempts.markPending(attempt.id, 'provider-expected-0001');
    await expect(
      settlePaidOrderForAttempt(
        fixture,
        attempt,
        'provider-different-0001',
        attempt.items,
      ),
    ).rejects.toMatchObject({
      response: { status: 'payment-attempt-unavailable' },
    });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        where: { paymentAttemptId: attempt.id },
      }),
    ).toMatchObject({ status: 'CLAIMED' });
  });

  it('rejects success when paid order items differ from the sealed attempt', async () => {
    const fixture = await createDraft('item-mismatch', 'account');
    const attempt = await attempts.prepare({
      checkoutDraftId: fixture.draftId,
      idempotencyKey: 'o2d-item-mismatch-attempt-0001',
      principal: { kind: 'account', userId: fixture.userId! },
    });
    await attempts.markPending(attempt.id, 'provider-item-mismatch-0001');
    const mismatchedItems = attempt.items.map((item) => ({
      ...item,
      productName: `${item.productName} changed`,
    }));
    await expect(
      settlePaidOrderForAttempt(
        fixture,
        attempt,
        'provider-item-mismatch-0001',
        mismatchedItems,
      ),
    ).rejects.toMatchObject({
      response: { status: 'payment-attempt-unavailable' },
    });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        where: { paymentAttemptId: attempt.id },
      }),
    ).toMatchObject({ status: 'CLAIMED' });
  });

  async function settlePaidOrderForAttempt(
    fixture: Awaited<ReturnType<typeof createDraft>>,
    attempt: Awaited<ReturnType<PaymentAttemptService['prepare']>>,
    providerPaymentReference: string,
    items: typeof attempt.items,
  ) {
    return prisma.$transaction(async (transaction) => {
      const order = await createPaidOrderForAttempt(
        transaction,
        fixture,
        attempt,
        providerPaymentReference,
        items,
      );
      await markPaymentAttemptSucceeded(
        transaction,
        attempt.id,
        order.id,
        new Date(),
      );
      return order;
    });
  }

  async function createPaidOrderForAttempt(
    transaction: Prisma.TransactionClient,
    fixture: Awaited<ReturnType<typeof createDraft>>,
    attempt: Awaited<ReturnType<PaymentAttemptService['prepare']>>,
    providerPaymentReference: string,
    items: typeof attempt.items,
  ) {
    return transaction.order.create({
      data: {
        cartId: fixture.cartId,
        city: 'Berlin',
        currency: attempt.currency,
        discountBasisPoints: attempt.discountBasisPoints,
        discountKind: attempt.discountKind,
        discountMinor: attempt.discountMinor,
        discountPolicyVersion: attempt.discountPolicyVersion,
        fullName: 'O2D Customer',
        idempotencyKey: `o2d-order-${fixture.cartId}`,
        itemSubtotalMinor: attempt.itemSubtotalMinor,
        items: {
          create: items.map(({ productId, ...item }) => ({
            ...item,
            productId,
          })),
        },
        paidAt: new Date(),
        paymentAttemptId: attempt.id,
        paymentMethod: 'STRIPE_DEBIT_CARD',
        paymentState: 'PAID',
        phoneNumber: '+49 30 123456',
        placedAt: new Date(),
        providerPaymentReference,
        requestHash: Uint8Array.from(Buffer.alloc(32, 0x55)),
        shippingAddress: 'O2D Street 1',
        shippingMinor: attempt.shippingMinor,
        status: 'PAID',
        totalMinor: attempt.totalMinor,
        userId: fixture.userId!,
      },
    });
  }

  function rawPaymentAttemptData(
    fixture: Awaited<ReturnType<typeof createDraft>>,
    source: StoredPaymentAttempt,
    idempotencyKey: string,
    discountKind: 'FIRST_PURCHASE' | 'NONE' = 'FIRST_PURCHASE',
  ) {
    const discounted = discountKind === 'FIRST_PURCHASE';
    return {
      checkoutDraftId: fixture.draftId,
      checkoutDraftVersion: source.checkoutDraftVersion,
      city: 'Berlin',
      countryCode: 'DE',
      currency: source.currency,
      discountBasisPoints: discounted ? source.discountBasisPoints : 0,
      discountKind,
      discountMinor: discounted ? source.discountMinor : 0,
      discountPolicyVersion: discounted
        ? source.discountPolicyVersion
        : 'no-discount-v1',
      email: 'concurrent@example.test',
      fullName: 'Concurrent Customer',
      idempotencyKey,
      itemSubtotalMinor: source.itemSubtotalMinor,
      phoneNumber: '+49 30 123456',
      postalCode: '10115',
      quotedAt: new Date(),
      requestHash: Uint8Array.from(Buffer.alloc(32, 0x65)),
      shippingMinor: source.shippingMinor,
      snapshotSealedAt: null,
      street: 'Concurrent Street',
      totalMinor: discounted
        ? source.totalMinor
        : source.itemSubtotalMinor + source.shippingMinor,
      userId: fixture.userId!,
    } as const;
  }

  async function createSealedAttemptAndInsertClaim(
    fixture: Awaited<ReturnType<typeof createDraft>>,
    source: StoredPaymentAttempt,
    idempotencyKey: string,
    claimStatus: 'CLAIMED' | 'RELEASED',
  ) {
    return prisma.$transaction(async (transaction) => {
      const created = await transaction.paymentAttempt.create({
        data: rawPaymentAttemptData(fixture, source, idempotencyKey),
      });
      await transaction.paymentAttemptItem.createMany({
        data: source.items.map(({ productId, ...item }) => ({
          ...item,
          paymentAttemptId: created.id,
          productId,
        })),
      });
      const sealed = await transaction.paymentAttempt.update({
        data: { snapshotSealedAt: new Date() },
        where: { id: created.id },
      });
      await transaction.firstPurchaseDiscountClaim.create({
        data:
          claimStatus === 'CLAIMED'
            ? {
                heldAt: new Date(),
                paymentAttemptId: sealed.id,
                userId: fixture.userId!,
              }
            : {
                heldAt: new Date(),
                paymentAttemptId: sealed.id,
                releaseReason: 'DEFINITIVE_PAYMENT_FAILED',
                releasedAt: new Date(),
                status: 'RELEASED',
                userId: fixture.userId!,
              },
      });
      return sealed;
    });
  }

  async function createDraft(identity: string, kind: 'account' | 'guest') {
    fixtureSequence += 1;
    const user =
      kind === 'account'
        ? await prisma.user.create({
            data: {
              email: `${identity}-${fixtureSequence}@example.test`,
              normalizedEmail: `${identity}-${fixtureSequence}@example.test`,
            },
          })
        : null;
    const cart = await prisma.cart.create({
      data: {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        tokenDigest: Uint8Array.from(Buffer.alloc(32, fixtureSequence)),
        userId: user?.id ?? null,
      },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: productSlug },
    });
    await prisma.cartItem.create({
      data: { amount: 1, cartId: cart.id, productId: product.id },
    });
    const createdAt = new Date();
    const draft = await prisma.checkoutDraft.create({
      data: {
        cartId: cart.id,
        city: 'Berlin',
        countryCode: 'DE',
        email: user?.email ?? `${identity}-${fixtureSequence}@example.test`,
        fullName: 'O2D Customer',
        guestCapabilityDigest:
          kind === 'guest' ? Uint8Array.from(Buffer.alloc(32, 0x77)) : null,
        guestCapabilityExpiresAt:
          kind === 'guest'
            ? new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000)
            : null,
        paymentMethod: 'STRIPE_DEBIT_CARD',
        phoneNumber: '+49 30 123456',
        postalCode: '10115',
        street: 'O2D Street',
        userId: user?.id ?? null,
        ...(kind === 'guest' ? { createdAt } : {}),
      },
    });
    return { cartId: cart.id, draftId: draft.id, userId: user?.id ?? null };
  }

  async function createHistoricalPaidOrder(userId: string): Promise<void> {
    fixtureSequence += 1;
    const cart = await prisma.cart.create({
      data: {
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
        tokenDigest: Uint8Array.from(Buffer.alloc(32, fixtureSequence)),
      },
    });
    await prisma.order.create({
      data: {
        cartId: cart.id,
        city: 'Portland',
        currency: 'USD',
        fullName: 'Historical Customer',
        idempotencyKey: `historical-paid-${fixtureSequence}`,
        itemSubtotalMinor: 100,
        paidAt: new Date(),
        paymentMethod: 'STRIPE_DEBIT_CARD',
        paymentState: 'PAID',
        phoneNumber: '+1 555 0100',
        placedAt: new Date(),
        providerPaymentReference: `historical-provider-${fixtureSequence}`,
        requestHash: Uint8Array.from(Buffer.alloc(32, 0x33)),
        shippingAddress: '10 Brewery Lane',
        shippingMinor: 500,
        status: 'PAID',
        totalMinor: 600,
        userId,
      },
    });
  }

  async function productStock(): Promise<number> {
    return (
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } })
    ).stockAmount;
  }
});
