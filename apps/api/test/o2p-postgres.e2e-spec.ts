import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { hashCheckoutCapability } from '../src/checkout/checkout-capability-token';
import { PrismaService } from '../src/database/prisma.service';
import { PaymentAttemptService } from '../src/payments/payment-attempt.service';
import type { StripeGatewayService } from '../src/payments/stripe-gateway.service';
import { StripePaymentService } from '../src/payments/stripe-payment.service';

const describePostgres =
  process.env.RUN_O2P_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const productSlug = 'safale-us05-yeast';
const now = new Date('2026-09-10T12:00:00.000Z');
let sequence = 0;

describePostgres('O2P Stripe Sandbox orchestration with PostgreSQL', () => {
  let attempts: PaymentAttemptService;
  let gateway: jest.Mocked<
    Pick<
      StripeGatewayService,
      | 'cancelPaymentIntent'
      | 'capturePaymentIntent'
      | 'constructEvent'
      | 'createCheckoutSession'
      | 'enabled'
      | 'retrieveCheckoutSession'
      | 'retrievePaymentIntent'
    >
  >;
  let payments: StripePaymentService;
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = new PrismaService();
    attempts = new PaymentAttemptService(prisma);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "StripeWebhookReceipt",
        "PaymentAllocation",
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
        stockAmount: 10,
      },
      where: { slug: productSlug },
    });
    gateway = {
      cancelPaymentIntent: jest.fn(),
      capturePaymentIntent: jest.fn(),
      constructEvent: jest.fn(),
      createCheckoutSession: jest.fn(),
      enabled: jest.fn().mockReturnValue(true),
      retrieveCheckoutSession: jest.fn(),
      retrievePaymentIntent: jest.fn(),
    };
    payments = new StripePaymentService(
      prisma,
      attempts,
      gateway as unknown as StripeGatewayService,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists a guest Session before Stripe creates the PaymentIntent', async () => {
    const fixture = await createDraft('guest-session', 'guest');
    gateway.createCheckoutSession.mockImplementation((snapshot) =>
      Promise.resolve({
        amountTotal: 10_500,
        attemptId: snapshot.id,
        checkoutUrl: 'https://checkout.stripe.test/c/session',
        currency: 'eur',
        expiresAt: new Date(now.getTime() + 31 * 60 * 1_000),
        ownerReference: snapshot.ownerReference,
        paymentIntentId: null,
        paymentStatus: 'unpaid',
        sessionId: 'cs_test_guest_session',
        sessionStatus: 'open',
      }),
    );

    await expect(
      start(fixture, 'o2p-guest-session-0001'),
    ).resolves.toMatchObject({
      checkoutUrl: 'https://checkout.stripe.test/c/session',
      status: 'ready_for_redirect',
    });
    expect(
      await prisma.paymentAttempt.findFirstOrThrow({
        select: {
          providerPaymentReference: true,
          providerSessionId: true,
          status: true,
        },
      }),
    ).toEqual({
      providerPaymentReference: null,
      providerSessionId: 'cs_test_guest_session',
      status: 'PENDING',
    });
  });

  it('creates no attempt or discount claim while new Stripe starts are disabled', async () => {
    const fixture = await createDraft('disabled-start', 'account');
    gateway.enabled.mockReturnValue(false);

    await expect(
      start(fixture, 'o2p-disabled-start-0001'),
    ).rejects.toMatchObject({ response: { status: 'payment-unavailable' } });
    expect(await prisma.paymentAttempt.count()).toBe(0);
    expect(await prisma.firstPurchaseDiscountClaim.count()).toBe(0);
    expect(gateway.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('recovers an unknown Session creation outcome without duplicating the attempt or claim', async () => {
    const fixture = await createDraft('session-timeout', 'account');
    gateway.createCheckoutSession
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockImplementation((snapshot) =>
        Promise.resolve({
          amountTotal: 9_900,
          attemptId: snapshot.id,
          checkoutUrl: 'https://checkout.stripe.test/c/recovered-session',
          currency: 'eur',
          expiresAt: new Date(now.getTime() + 31 * 60 * 1_000),
          ownerReference: snapshot.ownerReference,
          paymentIntentId: null,
          paymentStatus: 'unpaid',
          sessionId: 'cs_test_recovered_session',
          sessionStatus: 'open',
        }),
      );

    await expect(
      start(fixture, 'o2p-session-timeout-0001'),
    ).rejects.toMatchObject({ response: { status: 'payment-unavailable' } });
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    expect(attempt).toMatchObject({
      providerSessionId: null,
      status: 'RECONCILIATION_REQUIRED',
    });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        select: { status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({ status: 'CLAIMED' });

    await expect(
      start(fixture, 'o2p-session-timeout-0001'),
    ).resolves.toMatchObject({
      attemptId: attempt.id,
      status: 'ready_for_redirect',
    });
    expect(gateway.createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(gateway.createCheckoutSession.mock.calls[0]?.[0].id).toBe(
      gateway.createCheckoutSession.mock.calls[1]?.[0].id,
    );
    expect(await prisma.paymentAttempt.count()).toBe(1);
    expect(await prisma.firstPurchaseDiscountClaim.count()).toBe(1);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { providerSessionId: true, status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({
      providerSessionId: 'cs_test_recovered_session',
      status: 'PENDING',
    });
  });

  it('allocates and captures once, finalizes one guest order, and dedupes webhook replay', async () => {
    const fixture = await prepareSession('guest-success', 'guest');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    const capturable = paymentIntent(attempt, 'requires_capture');
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_guest_success',
        'payment_intent.amount_capturable_updated',
        capturable,
      ),
    );
    gateway.capturePaymentIntent.mockResolvedValue(
      paymentIntent(attempt, 'succeeded'),
    );
    const rawBody = Buffer.from('{"id":"evt_guest_success"}');

    await payments.acceptWebhook(rawBody, 'test-signature', now);
    await payments.acceptWebhook(rawBody, 'test-signature', now);

    expect(gateway.capturePaymentIntent).toHaveBeenCalledTimes(1);
    expect(await stock()).toBe(9);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.stripeWebhookReceipt.count()).toBe(1);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'SUCCEEDED' });
    expect(
      await prisma.paymentAllocation.findUniqueOrThrow({
        where: { paymentAttemptId: attempt.id },
      }),
    ).toMatchObject({ status: 'CAPTURED' });
    expect(
      await payments.currentStatus(
        fixture.cartAccess,
        fixture.rawGuestCapability,
      ),
    ).toMatchObject({ status: 'succeeded' });
  });

  it('cancels the authorization and releases the discount claim when stock is unavailable', async () => {
    await prepareSession('stock-race', 'account');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    await prisma.product.update({
      data: { stockAmount: 0 },
      where: { slug: productSlug },
    });
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_stock_race',
        'payment_intent.amount_capturable_updated',
        paymentIntent(attempt, 'requires_capture'),
      ),
    );
    gateway.cancelPaymentIntent.mockResolvedValue(
      paymentIntent(attempt, 'canceled'),
    );

    await payments.acceptWebhook(
      Buffer.from('{"id":"evt_stock_race"}'),
      'test-signature',
      now,
    );

    expect(gateway.cancelPaymentIntent).toHaveBeenCalledTimes(1);
    expect(gateway.capturePaymentIntent).not.toHaveBeenCalled();
    expect(await prisma.paymentAllocation.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'CANCELLED' });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        select: { releaseReason: true, status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({
      releaseReason: 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID',
      status: 'RELEASED',
    });
  });

  it('retains allocated stock and claim when capture outcome is ambiguous', async () => {
    await prepareSession('ambiguous-capture', 'account');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_ambiguous_capture',
        'payment_intent.amount_capturable_updated',
        paymentIntent(attempt, 'requires_capture'),
      ),
    );
    gateway.capturePaymentIntent.mockRejectedValue(new Error('timeout'));

    await payments.acceptWebhook(
      Buffer.from('{"id":"evt_ambiguous_capture"}'),
      'test-signature',
      now,
    );

    expect(await stock()).toBe(9);
    expect(
      await prisma.order.findUniqueOrThrow({
        select: { paymentState: true, status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({ paymentState: 'PENDING', status: 'PLACED' });
    const allocation = await prisma.paymentAllocation.findUniqueOrThrow({
      where: { paymentAttemptId: attempt.id },
    });
    expect(typeof allocation.orderId).toBe('string');
    expect(allocation.status).toBe('RECONCILIATION_REQUIRED');
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'RECONCILIATION_REQUIRED' });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        select: { status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({ status: 'CLAIMED' });

    const order = await prisma.order.findUniqueOrThrow({
      where: { paymentAttemptId: attempt.id },
    });
    await expect(
      prisma.order.update({
        data: { providerPaymentReference: 'pi_test_forged_reference' },
        where: { id: order.id },
      }),
    ).rejects.toThrow(/exact immutable order snapshot/i);
    await expect(
      prisma.order.update({
        data: { paidAt: now, paymentState: 'PAID', status: 'PAID' },
        where: { id: order.id },
      }),
    ).rejects.toThrow(/active PaymentAllocation requires one pending order/i);
    await expect(
      prisma.orderItem.update({
        data: { productName: 'Forged Product' },
        where: { id: (await prisma.orderItem.findFirstOrThrow()).id },
      }),
    ).rejects.toThrow(/exact immutable order snapshot/i);
    await expect(
      prisma.paymentAllocation.delete({
        where: { paymentAttemptId: attempt.id },
      }),
    ).rejects.toThrow(/history cannot be deleted/i);
  });

  it('allows a later attempt after release while retaining the cancelled order history', async () => {
    const fixture = await prepareSession('released-retry', 'account');
    const firstAttempt = await prisma.paymentAttempt.findFirstOrThrow();
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_released_retry_first',
        'payment_intent.amount_capturable_updated',
        paymentIntent(firstAttempt, 'requires_capture'),
      ),
    );
    gateway.capturePaymentIntent.mockRejectedValue(new Error('timeout'));
    await payments.acceptWebhook(
      Buffer.from('{"id":"evt_released_retry_first"}'),
      'test-signature',
      now,
    );

    gateway.retrievePaymentIntent.mockResolvedValue(
      paymentIntent(firstAttempt, 'canceled'),
    );
    await expect(
      payments.reconcile(fixture.cartAccess, null, new Date(now.getTime() + 1)),
    ).resolves.toMatchObject({ status: 'cancelled' });
    expect(await stock()).toBe(10);
    expect(
      await prisma.order.findUniqueOrThrow({
        select: { paymentState: true, status: true },
        where: { paymentAttemptId: firstAttempt.id },
      }),
    ).toEqual({ paymentState: 'FAILED', status: 'CANCELLED' });

    gateway.createCheckoutSession.mockImplementation((snapshot) =>
      Promise.resolve({
        amountTotal: 9_900,
        attemptId: snapshot.id,
        checkoutUrl: 'https://checkout.stripe.test/c/retry-session',
        currency: 'eur',
        expiresAt: new Date(now.getTime() + 31 * 60 * 1_000),
        ownerReference: snapshot.ownerReference,
        paymentIntentId: null,
        paymentStatus: 'unpaid',
        sessionId: `cs_test_${snapshot.id}`,
        sessionStatus: 'open',
      }),
    );
    await start(fixture, 'o2p-released-retry-0002');
    const secondAttempt = await prisma.paymentAttempt.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { id: { not: firstAttempt.id } },
    });
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_released_retry_second',
        'payment_intent.amount_capturable_updated',
        paymentIntent(secondAttempt, 'requires_capture'),
      ),
    );
    gateway.capturePaymentIntent.mockResolvedValue(
      paymentIntent(secondAttempt, 'succeeded'),
    );
    await payments.acceptWebhook(
      Buffer.from('{"id":"evt_released_retry_second"}'),
      'test-signature',
      new Date(now.getTime() + 2),
    );

    expect(await prisma.order.count()).toBe(2);
    expect(await stock()).toBe(9);
    expect(
      await prisma.order.findUniqueOrThrow({
        select: { paymentState: true, status: true },
        where: { paymentAttemptId: secondAttempt.id },
      }),
    ).toEqual({ paymentState: 'PAID', status: 'PAID' });
    expect(
      await prisma.firstPurchaseDiscountClaim.findMany({
        orderBy: { createdAt: 'asc' },
        select: { status: true },
      }),
    ).toEqual([{ status: 'RELEASED' }, { status: 'CONSUMED' }]);
  });

  it('resumes an ALLOCATED crash point and finalizes without a second allocation', async () => {
    await prepareSession('allocated-restart', 'account');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    const capturable = paymentIntent(attempt, 'requires_capture');
    const rawBody = Buffer.from('{"id":"evt_allocated_restart"}');
    const internals = payments as unknown as {
      processWebhookEvent(
        event: Stripe.Event,
        payloadHash: Uint8Array<ArrayBuffer>,
        receivedAt: Date,
      ): Promise<unknown>;
    };
    await internals.processWebhookEvent(
      event(
        'evt_allocated_restart',
        'payment_intent.amount_capturable_updated',
        capturable,
      ),
      Uint8Array.from(createHash('sha256').update(rawBody).digest()),
      now,
    );
    expect(
      await prisma.paymentAllocation.findUniqueOrThrow({
        select: { status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({ status: 'ALLOCATED' });

    gateway.retrievePaymentIntent.mockResolvedValue(capturable);
    gateway.capturePaymentIntent.mockResolvedValue(
      paymentIntent(attempt, 'succeeded'),
    );
    await payments.reconcileOutstanding(25, now);

    expect(gateway.capturePaymentIntent).toHaveBeenCalledTimes(1);
    expect(await prisma.paymentAllocation.count()).toBe(1);
    expect(await stock()).toBe(9);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'SUCCEEDED' });
  });

  it('eventually reconciles an expired pending Session when callbacks are lost', async () => {
    await prepareSession('lost-callback', 'guest');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    const payment = paymentIntent(attempt, 'requires_payment_method');
    gateway.retrieveCheckoutSession.mockResolvedValue({
      amountTotal: attempt.totalMinor,
      attemptId: attempt.id,
      checkoutUrl: 'https://checkout.stripe.test/c/session',
      currency: 'eur',
      expiresAt: new Date(now.getTime() + 31 * 60 * 1_000),
      ownerReference: ownerReference(attempt),
      paymentIntentId: payment.id,
      paymentStatus: 'unpaid',
      sessionId: attempt.providerSessionId!,
      sessionStatus: 'open',
    });
    gateway.retrievePaymentIntent.mockResolvedValue(payment);

    await payments.reconcileOutstanding(
      25,
      new Date(now.getTime() + 32 * 60 * 1_000),
    );

    expect(gateway.retrieveCheckoutSession).toHaveBeenCalledTimes(1);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { providerPaymentReference: true, status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({
      providerPaymentReference: payment.id,
      status: 'RECONCILIATION_REQUIRED',
    });
  });

  it('closes an expired unpaid Session without a PaymentIntent as definitively unpaid', async () => {
    await prepareSession('expired-without-intent', 'account');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    gateway.retrieveCheckoutSession.mockResolvedValue({
      amountTotal: attempt.totalMinor,
      attemptId: attempt.id,
      checkoutUrl: null,
      currency: 'eur',
      expiresAt: attempt.providerSessionExpiresAt!,
      ownerReference: ownerReference(attempt),
      paymentIntentId: null,
      paymentStatus: 'unpaid',
      sessionId: attempt.providerSessionId!,
      sessionStatus: 'expired',
    });

    await payments.reconcileOutstanding(
      25,
      new Date(attempt.providerSessionExpiresAt!.getTime() + 1),
    );

    expect(gateway.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({
        select: { status: true },
        where: { id: attempt.id },
      }),
    ).toEqual({ status: 'CANCELLED' });
    expect(
      await prisma.firstPurchaseDiscountClaim.findUniqueOrThrow({
        select: { releaseReason: true, status: true },
        where: { paymentAttemptId: attempt.id },
      }),
    ).toEqual({
      releaseReason: 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID',
      status: 'RELEASED',
    });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.paymentAllocation.count()).toBe(0);
    expect(await stock()).toBe(10);
  });

  it('rejects mismatched amounts and event-id payload substitution', async () => {
    await prepareSession('validation', 'guest');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow();
    const mismatched = paymentIntent(attempt, 'requires_capture');
    mismatched.amount = attempt.totalMinor + 1;
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_validation',
        'payment_intent.amount_capturable_updated',
        mismatched,
      ),
    );
    await expect(
      payments.acceptWebhook(Buffer.from('{"bad":1}'), 'test-signature', now),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.stripeWebhookReceipt.count()).toBe(0);

    const wrongOwner = paymentIntent(attempt, 'requires_capture');
    wrongOwner.metadata.owner_reference = 'user:wrong-owner';
    gateway.constructEvent.mockReturnValue(
      event(
        'evt_wrong_owner',
        'payment_intent.amount_capturable_updated',
        wrongOwner,
      ),
    );
    await expect(
      payments.acceptWebhook(
        Buffer.from('{"wrong_owner":1}'),
        'test-signature',
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.stripeWebhookReceipt.count()).toBe(0);

    const valid = paymentIntent(attempt, 'payment_failed');
    gateway.constructEvent.mockReturnValue(
      event('evt_validation', 'payment_intent.payment_failed', valid),
    );
    await payments.acceptWebhook(
      Buffer.from('{"same":1}'),
      'test-signature',
      now,
    );
    await expect(
      payments.acceptWebhook(Buffer.from('{"same":2}'), 'test-signature', now),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.stripeWebhookReceipt.count()).toBe(1);
    await expect(
      prisma.stripeWebhookReceipt.update({
        data: { disposition: 'IGNORED' },
        where: { providerEventId: 'evt_validation' },
      }),
    ).rejects.toThrow(/history cannot be changed or deleted/i);
  });

  async function prepareSession(identity: string, kind: 'account' | 'guest') {
    const fixture = await createDraft(identity, kind);
    gateway.createCheckoutSession.mockImplementation((snapshot) =>
      Promise.resolve({
        amountTotal: kind === 'account' ? 9_900 : 10_500,
        attemptId: snapshot.id,
        checkoutUrl: 'https://checkout.stripe.test/c/session',
        currency: 'eur',
        expiresAt: new Date(now.getTime() + 31 * 60 * 1_000),
        ownerReference: snapshot.ownerReference,
        paymentIntentId: null,
        paymentStatus: 'unpaid',
        sessionId: `cs_test_${identity}`,
        sessionStatus: 'open',
      }),
    );
    await start(fixture, `o2p-${identity}-0001`);
    return fixture;
  }

  async function start(
    fixture: Awaited<ReturnType<typeof createDraft>>,
    idempotencyKey: string,
  ) {
    return payments.startCheckout(
      {
        cart: fixture.cartAccess,
        checkoutDraftId: fixture.draftId,
        idempotencyKey,
        rawGuestCapability: fixture.rawGuestCapability,
      },
      now,
    );
  }

  async function createDraft(identity: string, kind: 'account' | 'guest') {
    sequence += 1;
    const user =
      kind === 'account'
        ? await prisma.user.create({
            data: {
              email: `${identity}-${sequence}@example.test`,
              normalizedEmail: `${identity}-${sequence}@example.test`,
            },
          })
        : null;
    const rawCartCapability = Buffer.alloc(32, sequence).toString('base64url');
    const rawGuestCapability =
      kind === 'guest'
        ? Buffer.alloc(32, sequence + 40).toString('base64url')
        : null;
    const cart = await prisma.cart.create({
      data: {
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
        tokenDigest: hashCheckoutCapability(rawCartCapability),
        userId: user?.id ?? null,
      },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: productSlug },
    });
    await prisma.cartItem.create({
      data: { amount: 1, cartId: cart.id, productId: product.id },
    });
    const draft = await prisma.checkoutDraft.create({
      data: {
        cartId: cart.id,
        city: 'Berlin',
        countryCode: 'DE',
        createdAt: now,
        email: user?.email ?? `${identity}-${sequence}@example.test`,
        fullName: 'O2P Customer',
        guestCapabilityDigest: rawGuestCapability
          ? hashCheckoutCapability(rawGuestCapability)
          : null,
        guestCapabilityExpiresAt: rawGuestCapability
          ? new Date(now.getTime() + 24 * 60 * 60 * 1_000)
          : null,
        paymentMethod: 'STRIPE_DEBIT_CARD',
        phoneNumber: '+49 30 123456',
        postalCode: '10115',
        street: 'O2P Street',
        userId: user?.id ?? null,
      },
    });
    const cartAccess = user
      ? ({
          cartId: cart.id,
          kind: 'account' as const,
          rawToken: rawCartCapability,
          userId: user.id,
        } as const)
      : ({
          cartId: cart.id,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
          rawToken: rawCartCapability,
        } as const);
    return { cartAccess, draftId: draft.id, rawGuestCapability };
  }

  function paymentIntent(
    attempt: Readonly<{
      checkoutDraftId: string;
      id: string;
      totalMinor: number;
      userId: string | null;
    }>,
    status:
      | 'canceled'
      | 'payment_failed'
      | 'requires_capture'
      | 'requires_payment_method'
      | 'succeeded',
  ): Stripe.PaymentIntent {
    return {
      amount: attempt.totalMinor,
      amount_capturable: status === 'requires_capture' ? attempt.totalMinor : 0,
      amount_received: status === 'succeeded' ? attempt.totalMinor : 0,
      capture_method: 'manual',
      currency: 'eur',
      id: `pi_test_${attempt.id}`,
      livemode: false,
      metadata: {
        environment: 'sandbox',
        owner_reference: ownerReference(attempt),
        payment_attempt_id: attempt.id,
      },
      object: 'payment_intent',
      status,
    } as unknown as Stripe.PaymentIntent;
  }

  function event(
    id: string,
    type: string,
    object: Stripe.PaymentIntent,
  ): Stripe.Event {
    return {
      created: Math.floor(now.getTime() / 1_000),
      data: { object },
      id,
      livemode: false,
      object: 'event',
      type,
    } as Stripe.Event;
  }

  function ownerReference(
    attempt: Readonly<{
      checkoutDraftId: string;
      userId: string | null;
    }>,
  ): string {
    return attempt.userId
      ? `user:${attempt.userId}`
      : `draft:${attempt.checkoutDraftId}`;
  }

  async function stock(): Promise<number> {
    return (
      await prisma.product.findUniqueOrThrow({ where: { slug: productSlug } })
    ).stockAmount;
  }
});
