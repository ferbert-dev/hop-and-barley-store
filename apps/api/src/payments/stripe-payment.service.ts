import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type Stripe from 'stripe';
import { checkoutLineOutcome } from '../cart/checkout-readiness';
import type { ActiveCartAccess } from '../cart/cart-request';
import { runCartSerializable } from '../cart/cart-transaction';
import { verifyCheckoutCapability } from '../checkout/checkout-capability-token';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type {
  StripeCheckoutSessionDto,
  StripePaymentStatusDto,
} from './dto/stripe-checkout.dto';
import {
  markPaymentAttemptSucceeded,
  PaymentAttemptService,
  releasePaymentAttemptDefinitiveOutcome,
} from './payment-attempt.service';
import {
  StripeGatewayService,
  type CreatedStripeCheckout,
} from './stripe-gateway.service';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const NOT_FOUND = Object.freeze({ status: 'not-found' as const });
const PAYMENT_UNAVAILABLE = Object.freeze({
  status: 'payment-unavailable' as const,
});
const ATTEMPT_UNAVAILABLE = Object.freeze({
  status: 'payment-attempt-unavailable' as const,
});

type StartCheckoutInput = Readonly<{
  cart: ActiveCartAccess;
  checkoutDraftId: string;
  idempotencyKey: string;
  rawGuestCapability: string | null;
}>;

type ProviderAction = Readonly<{
  attemptId: string;
  kind: 'cancel' | 'capture';
}> | null;

const stripeAttemptSelect = {
  checkoutDraftId: true,
  checkoutDraft: { select: { cartId: true } },
  city: true,
  countryCode: true,
  currency: true,
  discountBasisPoints: true,
  discountKind: true,
  discountMinor: true,
  discountPolicyVersion: true,
  email: true,
  fullName: true,
  houseNumber: true,
  id: true,
  idempotencyKey: true,
  itemSubtotalMinor: true,
  items: {
    orderBy: [{ productId: 'asc' as const }, { id: 'asc' as const }],
    select: {
      amount: true,
      amountUnit: true,
      lineTotalMinor: true,
      priceBasisAmount: true,
      priceMinor: true,
      priceQualifier: true,
      productId: true,
      productName: true,
      productSlug: true,
      saleKind: true,
    },
  },
  pendingAt: true,
  phoneNumber: true,
  postalCode: true,
  providerPaymentReference: true,
  providerSessionExpiresAt: true,
  providerSessionId: true,
  quotedAt: true,
  requestHash: true,
  shippingMinor: true,
  status: true,
  street: true,
  totalMinor: true,
  userId: true,
} satisfies Prisma.PaymentAttemptSelect;

type StripeAttempt = Prisma.PaymentAttemptGetPayload<{
  select: typeof stripeAttemptSelect;
}>;

@Injectable()
export class StripePaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: PaymentAttemptService,
    private readonly stripe: StripeGatewayService,
  ) {}

  async startCheckout(
    input: StartCheckoutInput,
    requestedNow = new Date(),
  ): Promise<StripeCheckoutSessionDto> {
    if (!this.stripe.enabled()) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    const principal =
      input.cart.kind === 'account'
        ? ({ kind: 'account', userId: input.cart.userId } as const)
        : ({ kind: 'guest' } as const);
    const prepared = await this.attempts.prepare(
      {
        cartId: input.cart.cartId,
        checkoutDraftId: input.checkoutDraftId,
        idempotencyKey: input.idempotencyKey,
        principal,
        rawGuestCapability: input.rawGuestCapability,
      },
      requestedNow,
    );
    let attempt = await this.loadAttempt(prepared.id);
    if (
      attempt.status === 'SUCCEEDED' ||
      attempt.status === 'DEFINITIVELY_FAILED' ||
      attempt.status === 'CANCELLED'
    ) {
      throw new ConflictException(ATTEMPT_UNAVAILABLE);
    }

    let session: CreatedStripeCheckout;
    try {
      if (attempt.providerSessionId) {
        session = await this.stripe.retrieveCheckoutSession(
          attempt.providerSessionId,
        );
        requireSessionMatchesAttempt(session, attempt, requestedNow);
        await this.attempts.markProviderSessionCreated(
          attempt.id,
          session.sessionId,
          session.expiresAt,
          requestedNow,
        );
        if (session.paymentIntentId) {
          await this.attempts.markPending(
            attempt.id,
            session.paymentIntentId,
            requestedNow,
          );
          attempt = await this.loadAttempt(attempt.id);
        }
      } else {
        session = await this.stripe.createCheckoutSession(
          {
            currency: attempt.currency,
            discountMinor: attempt.discountMinor,
            email: attempt.email,
            id: attempt.id,
            itemCount: attempt.items.length,
            itemSubtotalMinor: attempt.itemSubtotalMinor,
            ownerReference: ownerReference(attempt),
            shippingMinor: attempt.shippingMinor,
            totalMinor: attempt.totalMinor,
          },
          attempt.quotedAt,
        );
        requireSessionPayloadMatchesAttempt(session, attempt, requestedNow);
        await this.attempts.markProviderSessionCreated(
          attempt.id,
          session.sessionId,
          session.expiresAt,
          requestedNow,
        );
        if (session.paymentIntentId) {
          await this.attempts.markPending(
            attempt.id,
            session.paymentIntentId,
            requestedNow,
          );
        }
        attempt = await this.loadAttempt(attempt.id);
      }
    } catch (error) {
      await this.markAttemptReconciliation(attempt.id, requestedNow);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    requireSessionMatchesAttempt(session, attempt, requestedNow);
    if (!session.checkoutUrl) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    return {
      attemptId: attempt.id,
      checkoutUrl: session.checkoutUrl,
      expiresAt: session.expiresAt.toISOString(),
      status: 'ready_for_redirect',
    };
  }

  async currentStatus(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
  ): Promise<StripePaymentStatusDto> {
    const attempt = await this.findAccessibleAttempt(
      cart,
      rawGuestCapability,
      new Date(),
    );
    return toStatusDto(attempt);
  }

  async reconcile(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
    requestedNow = new Date(),
  ): Promise<StripePaymentStatusDto> {
    const attempt = await this.findAccessibleAttempt(
      cart,
      rawGuestCapability,
      requestedNow,
    );
    return this.reconcileAttempt(attempt.id, requestedNow);
  }

  async reconcileOutstanding(
    limit = 25,
    requestedNow = new Date(),
  ): Promise<void> {
    const candidates = await this.prisma.paymentAttempt.findMany({
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: limit,
      where: {
        OR: [
          { status: 'RECONCILIATION_REQUIRED' },
          {
            providerSessionExpiresAt: { lte: requestedNow },
            providerSessionId: { not: null },
            status: 'PENDING',
          },
          {
            allocation: {
              is: {
                status: {
                  in: [
                    'ALLOCATED',
                    'CAPTURE_REQUESTED',
                    'RECONCILIATION_REQUIRED',
                  ],
                },
              },
            },
          },
        ],
      },
    });
    for (const candidate of candidates) {
      try {
        await this.reconcileAttempt(candidate.id, requestedNow);
      } catch {
        await this.markAttemptReconciliation(candidate.id, requestedNow);
      }
    }
  }

  private async reconcileAttempt(
    attemptId: string,
    requestedNow: Date,
  ): Promise<StripePaymentStatusDto> {
    let attempt = await this.loadAttempt(attemptId);
    if (!attempt.providerPaymentReference) {
      if (!attempt.providerSessionId) return toStatusDto(attempt);
      let session: CreatedStripeCheckout;
      try {
        session = await this.stripe.retrieveCheckoutSession(
          attempt.providerSessionId,
        );
      } catch {
        await this.markAttemptReconciliation(attempt.id, requestedNow);
        throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
      }
      requireSessionMatchesAttempt(session, attempt, requestedNow, true);
      if (!session.paymentIntentId) {
        if (
          session.sessionStatus === 'expired' &&
          session.paymentStatus === 'unpaid'
        ) {
          await this.attempts.releaseDefinitiveOutcome(
            attempt.id,
            'cancelled_unpaid',
            requestedNow,
          );
        } else if (session.expiresAt <= requestedNow) {
          await this.markAttemptReconciliation(attempt.id, requestedNow);
        }
        return toStatusDto(await this.loadAttempt(attempt.id));
      }
      await this.attempts.markPending(
        attempt.id,
        session.paymentIntentId,
        requestedNow,
      );
      attempt = await this.loadAttempt(attempt.id);
    }
    const providerPaymentReference = attempt.providerPaymentReference;
    if (!providerPaymentReference) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await this.stripe.retrievePaymentIntent(
        providerPaymentReference,
      );
    } catch {
      await this.markAttemptReconciliation(attempt.id, requestedNow);
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    const providerAction = await this.applyPaymentIntentState(
      paymentIntent,
      attempt.id,
      requestedNow,
    );
    await this.applyProviderAction(providerAction, requestedNow);
    return toStatusDto(await this.loadAttempt(attempt.id));
  }

  async acceptWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    receivedAt = new Date(),
  ): Promise<void> {
    if (!rawBody || !signature || rawBody.length === 0) {
      throw new BadRequestException(PAYMENT_UNAVAILABLE);
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch {
      throw new BadRequestException(PAYMENT_UNAVAILABLE);
    }
    if (event.livemode) throw new BadRequestException(PAYMENT_UNAVAILABLE);
    const payloadHash = Uint8Array.from(
      createHash('sha256').update(rawBody).digest(),
    );
    const providerAction = await this.processWebhookEvent(
      event,
      payloadHash,
      receivedAt,
    );
    await this.applyProviderAction(providerAction, receivedAt);
  }

  private async processWebhookEvent(
    event: Stripe.Event,
    payloadHash: Uint8Array<ArrayBuffer>,
    receivedAt: Date,
  ): Promise<ProviderAction> {
    return runCartSerializable(this.prisma, async (transaction) => {
      await advisoryEventLock(transaction, event.id);
      const replay = await transaction.stripeWebhookReceipt.findUnique({
        select: { payloadHash: true },
        where: { providerEventId: event.id },
      });
      if (replay) {
        requireSamePayload(replay.payloadHash, payloadHash);
        return null;
      }

      const object = event.data.object;
      const objectId = providerEventObjectId(object);
      let attemptId: string | null = null;
      let providerAction: ProviderAction = null;
      let disposition: 'IGNORED' | 'PROCESSED' = 'IGNORED';

      if (object.object === 'payment_intent') {
        attemptId = requireAttemptMetadata(object.metadata);
        providerAction = await this.applyPaymentIntentEvent(
          transaction,
          event.type,
          object,
          attemptId,
          receivedAt,
        );
        disposition = 'PROCESSED';
      } else if (object.object === 'checkout.session') {
        attemptId = requireAttemptMetadata(object.metadata);
        await this.applyCheckoutSessionEvent(
          transaction,
          event.type,
          object,
          attemptId,
          receivedAt,
        );
        disposition = 'PROCESSED';
      }

      await transaction.stripeWebhookReceipt.create({
        data: {
          disposition,
          eventType: event.type,
          livemode: event.livemode,
          payloadHash,
          paymentAttemptId: attemptId,
          processedAt: receivedAt,
          providerCreatedAt: new Date(event.created * 1_000),
          providerEventId: event.id,
          providerObjectId: objectId,
          receivedAt,
        },
      });
      return providerAction;
    });
  }

  private async applyPaymentIntentEvent(
    transaction: Prisma.TransactionClient,
    eventType: string,
    paymentIntent: Stripe.PaymentIntent,
    attemptId: string,
    occurredAt: Date,
  ): Promise<ProviderAction> {
    const attempt = await this.lockAndAttachPaymentReference(
      transaction,
      attemptId,
      paymentIntent.id,
      occurredAt,
    );
    requirePaymentIntentMatchesAttempt(paymentIntent, attempt);
    if (eventType === 'payment_intent.amount_capturable_updated') {
      if (
        paymentIntent.status !== 'requires_capture' ||
        paymentIntent.capture_method !== 'manual' ||
        paymentIntent.amount_capturable !== attempt.totalMinor
      ) {
        throw new BadRequestException(PAYMENT_UNAVAILABLE);
      }
      const allocationAction = await this.allocateInventory(
        transaction,
        attempt,
        occurredAt,
      );
      return allocationAction
        ? { attemptId: attempt.id, kind: allocationAction }
        : null;
    }
    if (eventType === 'payment_intent.succeeded') {
      if (
        paymentIntent.status !== 'succeeded' ||
        paymentIntent.amount_received !== attempt.totalMinor
      ) {
        throw new BadRequestException(PAYMENT_UNAVAILABLE);
      }
      await this.finalizeCapturedPayment(transaction, attempt, occurredAt);
      return null;
    }
    if (eventType === 'payment_intent.canceled') {
      await this.releaseUnpaidPayment(
        transaction,
        attempt,
        'PAYMENT_CANCELLED',
        'cancelled_unpaid',
        occurredAt,
      );
      return null;
    }
    if (eventType === 'payment_intent.payment_failed') {
      return null;
    }
    return null;
  }

  private async applyCheckoutSessionEvent(
    transaction: Prisma.TransactionClient,
    eventType: string,
    session: Stripe.Checkout.Session,
    attemptId: string,
    occurredAt: Date,
  ): Promise<void> {
    const paymentIntentId = providerObjectId(session.payment_intent);
    const attempt = paymentIntentId
      ? await this.lockAndAttachPaymentReference(
          transaction,
          attemptId,
          paymentIntentId,
          occurredAt,
        )
      : await this.lockAndLoadAttempt(transaction, attemptId);
    if (
      session.livemode ||
      session.id !== attempt.providerSessionId ||
      session.client_reference_id !== attempt.id ||
      session.metadata?.owner_reference !== ownerReference(attempt) ||
      session.currency !== attempt.currency.toLowerCase() ||
      session.amount_total !== attempt.totalMinor ||
      (attempt.providerPaymentReference !== null &&
        paymentIntentId !== attempt.providerPaymentReference)
    ) {
      throw new BadRequestException(PAYMENT_UNAVAILABLE);
    }
    if (eventType === 'checkout.session.expired') {
      const allocation = await transaction.paymentAllocation.findUnique({
        select: { status: true },
        where: { paymentAttemptId: attempt.id },
      });
      if (!allocation && session.payment_status === 'unpaid') {
        await releasePaymentAttemptDefinitiveOutcome(
          transaction,
          attempt.id,
          'cancelled_unpaid',
          occurredAt,
        );
      } else if (attempt.status !== 'SUCCEEDED') {
        await markReconciliation(transaction, attempt.id, occurredAt);
      }
    }
  }

  private async applyPaymentIntentState(
    paymentIntent: Stripe.PaymentIntent,
    attemptId: string,
    occurredAt: Date,
  ): Promise<ProviderAction> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const attempt = await this.lockAndLoadAttempt(transaction, attemptId);
      requirePaymentIntentMatchesAttempt(paymentIntent, attempt);
      if (paymentIntent.status === 'requires_capture') {
        if (
          paymentIntent.capture_method !== 'manual' ||
          paymentIntent.amount_capturable !== attempt.totalMinor
        ) {
          throw new ConflictException(ATTEMPT_UNAVAILABLE);
        }
        const allocationAction = await this.allocateInventory(
          transaction,
          attempt,
          occurredAt,
        );
        return allocationAction
          ? { attemptId: attempt.id, kind: allocationAction }
          : null;
      }
      if (paymentIntent.status === 'succeeded') {
        if (paymentIntent.amount_received !== attempt.totalMinor) {
          throw new ConflictException(ATTEMPT_UNAVAILABLE);
        }
        await this.finalizeCapturedPayment(transaction, attempt, occurredAt);
        return null;
      }
      if (paymentIntent.status === 'canceled') {
        await this.releaseUnpaidPayment(
          transaction,
          attempt,
          'PAYMENT_CANCELLED',
          'cancelled_unpaid',
          occurredAt,
        );
        return null;
      }
      await markReconciliation(transaction, attempt.id, occurredAt);
      return null;
    });
  }

  private async allocateInventory(
    transaction: Prisma.TransactionClient,
    attempt: StripeAttempt,
    occurredAt: Date,
  ): Promise<'cancel' | 'capture' | null> {
    const existing = await transaction.paymentAllocation.findUnique({
      select: { status: true },
      where: { paymentAttemptId: attempt.id },
    });
    if (existing) {
      return existing.status !== 'CAPTURED' && existing.status !== 'RELEASED'
        ? 'capture'
        : null;
    }
    await lockCart(transaction, attempt.checkoutDraft.cartId);
    await lockProducts(
      transaction,
      attempt.items.map(({ productId }) => productId),
    );
    const products = await transaction.product.findMany({
      select: {
        activeFrom: true,
        activeUntil: true,
        amountUnit: true,
        currency: true,
        id: true,
        isActive: true,
        maximumOrderAmount: true,
        minimumOrderAmount: true,
        orderStepAmount: true,
        priceBasisAmount: true,
        priceMinor: true,
        saleKind: true,
        stockAmount: true,
      },
      where: { id: { in: attempt.items.map(({ productId }) => productId) } },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const unavailable = attempt.items.some(
      (item) =>
        checkoutLineOutcome(
          productsById.get(item.productId),
          item.amount,
          occurredAt,
        ) !== 'available',
    );
    if (unavailable) {
      await markReconciliation(transaction, attempt.id, occurredAt);
      return 'cancel';
    }
    for (const item of attempt.items) {
      const updated = await transaction.product.updateMany({
        data: { stockAmount: { decrement: item.amount } },
        where: { id: item.productId, stockAmount: { gte: item.amount } },
      });
      if (updated.count !== 1) {
        throw new UnprocessableEntityException(ATTEMPT_UNAVAILABLE);
      }
    }
    const order = await transaction.order.create({
      data: {
        cartId: attempt.checkoutDraft.cartId,
        city: attempt.city,
        currency: attempt.currency,
        discountBasisPoints: attempt.discountBasisPoints,
        discountKind: attempt.discountKind,
        discountMinor: attempt.discountMinor,
        discountPolicyVersion: attempt.discountPolicyVersion,
        fullName: attempt.fullName,
        idempotencyKey: `stripe-${attempt.id}`,
        itemSubtotalMinor: attempt.itemSubtotalMinor,
        items: {
          create: attempt.items.map(({ productId, ...item }) => ({
            ...item,
            productId,
          })),
        },
        paidAt: null,
        paymentAttemptId: attempt.id,
        paymentMethod: 'STRIPE_DEBIT_CARD',
        paymentState: 'PENDING',
        phoneNumber: attempt.phoneNumber,
        placedAt: occurredAt,
        providerPaymentReference: attempt.providerPaymentReference,
        requestHash: attempt.requestHash,
        shippingAddress: shippingAddress(attempt),
        shippingMinor: attempt.shippingMinor,
        status: 'PLACED',
        totalMinor: attempt.totalMinor,
        userId: attempt.userId,
      },
      select: { id: true },
    });
    await transaction.paymentAllocation.create({
      data: {
        authorizedAt: occurredAt,
        orderId: order.id,
        paymentAttemptId: attempt.id,
        providerPaymentReference: attempt.providerPaymentReference!,
      },
    });
    return 'capture';
  }

  private async applyProviderAction(
    action: ProviderAction,
    occurredAt: Date,
  ): Promise<void> {
    if (!action) return;
    if (action.kind === 'capture') {
      await this.requestCapture(action.attemptId, occurredAt);
      return;
    }
    await this.requestCancellation(action.attemptId, occurredAt);
  }

  private async requestCancellation(
    attemptId: string,
    requestedAt: Date,
  ): Promise<void> {
    const attempt = await this.loadAttempt(attemptId);
    if (!attempt.providerPaymentReference) {
      await this.markAttemptReconciliation(attemptId, requestedAt);
      return;
    }
    try {
      const paymentIntent = await this.stripe.cancelPaymentIntent(
        attempt.providerPaymentReference,
      );
      if (paymentIntent.status !== 'canceled') {
        await this.markAttemptReconciliation(attemptId, requestedAt);
        return;
      }
      await this.applyPaymentIntentState(paymentIntent, attemptId, requestedAt);
    } catch {
      await this.markAttemptReconciliation(attemptId, requestedAt);
    }
  }

  private async requestCapture(
    attemptId: string,
    requestedAt: Date,
  ): Promise<void> {
    const paymentReference = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const attempt = await this.lockAndLoadAttempt(transaction, attemptId);
        const allocation = await transaction.paymentAllocation.findUnique({
          where: { paymentAttemptId: attempt.id },
        });
        if (
          !allocation ||
          ['CAPTURED', 'RELEASED'].includes(allocation.status)
        ) {
          return null;
        }
        await transaction.paymentAllocation.update({
          data: {
            captureRequestedAt: allocation.captureRequestedAt ?? requestedAt,
            status: 'CAPTURE_REQUESTED',
          },
          where: { paymentAttemptId: attempt.id },
        });
        return attempt.providerPaymentReference;
      },
    );
    if (!paymentReference) return;
    try {
      const paymentIntent =
        await this.stripe.capturePaymentIntent(paymentReference);
      if (paymentIntent.status === 'succeeded') {
        await this.applyPaymentIntentState(
          paymentIntent,
          attemptId,
          requestedAt,
        );
      } else {
        await this.markAttemptReconciliation(attemptId, requestedAt);
      }
    } catch {
      await this.markAttemptReconciliation(attemptId, requestedAt);
    }
  }

  private async finalizeCapturedPayment(
    transaction: Prisma.TransactionClient,
    attempt: StripeAttempt,
    occurredAt: Date,
  ): Promise<void> {
    if (attempt.status === 'SUCCEEDED') return;
    const allocation = await transaction.paymentAllocation.findUnique({
      where: { paymentAttemptId: attempt.id },
    });
    if (
      !allocation ||
      allocation.status === 'RELEASED' ||
      allocation.captureRequestedAt === null
    ) {
      throw new ConflictException(ATTEMPT_UNAVAILABLE);
    }
    const order = await transaction.order.findUnique({
      select: { id: true },
      where: { paymentAttemptId: attempt.id },
    });
    if (!order) throw new ConflictException(ATTEMPT_UNAVAILABLE);
    await transaction.order.update({
      data: {
        paidAt: occurredAt,
        paymentState: 'PAID',
        status: 'PAID',
      },
      where: { id: order.id },
    });
    await transaction.paymentAllocation.update({
      data: { capturedAt: occurredAt, status: 'CAPTURED' },
      where: { paymentAttemptId: attempt.id },
    });
    await markPaymentAttemptSucceeded(
      transaction,
      attempt.id,
      order.id,
      occurredAt,
    );
    for (const item of attempt.items) {
      await transaction.cartItem.deleteMany({
        where: {
          amount: item.amount,
          cartId: attempt.checkoutDraft.cartId,
          productId: item.productId,
        },
      });
    }
    await transaction.cart.update({
      data: {
        updatedAt: occurredAt,
        ...(attempt.userId ? { userId: null } : {}),
      },
      where: { id: attempt.checkoutDraft.cartId },
    });
  }

  private async releaseUnpaidPayment(
    transaction: Prisma.TransactionClient,
    attempt: StripeAttempt,
    allocationReason:
      | 'AUTHORIZATION_EXPIRED'
      | 'PAYMENT_CANCELLED'
      | 'PAYMENT_FAILED'
      | 'STOCK_UNAVAILABLE',
    outcome: 'cancelled_unpaid' | 'failed',
    occurredAt: Date,
  ): Promise<void> {
    const allocation = await transaction.paymentAllocation.findUnique({
      where: { paymentAttemptId: attempt.id },
    });
    if (allocation && allocation.status !== 'RELEASED') {
      if (allocation.status === 'CAPTURED') {
        throw new ConflictException(ATTEMPT_UNAVAILABLE);
      }
      await lockProducts(
        transaction,
        attempt.items.map(({ productId }) => productId),
      );
      for (const item of attempt.items) {
        await transaction.product.update({
          data: { stockAmount: { increment: item.amount } },
          where: { id: item.productId },
        });
      }
      await transaction.paymentAllocation.update({
        data: {
          releaseReason: allocationReason,
          releasedAt: occurredAt,
          status: 'RELEASED',
        },
        where: { paymentAttemptId: attempt.id },
      });
      await transaction.order.update({
        data: { paymentState: 'FAILED', status: 'CANCELLED' },
        where: { id: allocation.orderId },
      });
    }
    await releasePaymentAttemptDefinitiveOutcome(
      transaction,
      attempt.id,
      outcome,
      occurredAt,
    );
  }

  private async markAttemptReconciliation(
    attemptId: string,
    occurredAt: Date,
  ): Promise<void> {
    await runCartSerializable(this.prisma, async (transaction) => {
      await markReconciliation(transaction, attemptId, occurredAt);
      const allocation = await transaction.paymentAllocation.findUnique({
        where: { paymentAttemptId: attemptId },
      });
      if (
        allocation &&
        allocation.status !== 'CAPTURED' &&
        allocation.status !== 'RELEASED'
      ) {
        await transaction.paymentAllocation.update({
          data: {
            captureRequestedAt: allocation.captureRequestedAt ?? occurredAt,
            status: 'RECONCILIATION_REQUIRED',
          },
          where: { paymentAttemptId: attemptId },
        });
      }
    });
  }

  private async findAccessibleAttempt(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
    requestedNow: Date,
  ): Promise<StripeAttempt> {
    if (cart.kind === 'account') {
      const attempt = await this.prisma.paymentAttempt.findFirst({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: stripeAttemptSelect,
        where: { userId: cart.userId },
      });
      if (!attempt) throw new NotFoundException(NOT_FOUND);
      return attempt;
    }
    const draft = await this.prisma.checkoutDraft.findUnique({
      select: {
        guestCapabilityDigest: true,
        guestCapabilityExpiresAt: true,
        paymentAttempts: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: stripeAttemptSelect,
          take: 1,
        },
        userId: true,
      },
      where: { cartId: cart.cartId },
    });
    if (
      !draft ||
      draft.userId !== null ||
      !verifyCheckoutCapability(
        rawGuestCapability,
        draft.guestCapabilityDigest,
        draft.guestCapabilityExpiresAt,
        requestedNow,
      )
    ) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    const attempt = draft.paymentAttempts[0];
    if (!attempt) throw new NotFoundException(NOT_FOUND);
    return attempt;
  }

  private loadAttempt(attemptId: string): Promise<StripeAttempt> {
    return this.prisma.paymentAttempt.findUniqueOrThrow({
      select: stripeAttemptSelect,
      where: { id: attemptId },
    });
  }

  private async lockAndLoadAttempt(
    transaction: Prisma.TransactionClient,
    attemptId: string,
  ): Promise<StripeAttempt> {
    await transaction.$queryRaw`
      SELECT "id" FROM "PaymentAttempt"
      WHERE "id" = ${attemptId}::uuid
      FOR UPDATE
    `;
    const attempt = await transaction.paymentAttempt.findUnique({
      select: stripeAttemptSelect,
      where: { id: attemptId },
    });
    if (!attempt) throw new BadRequestException(PAYMENT_UNAVAILABLE);
    return attempt;
  }

  private async lockAndAttachPaymentReference(
    transaction: Prisma.TransactionClient,
    attemptId: string,
    providerPaymentReference: string,
    occurredAt: Date,
  ): Promise<StripeAttempt> {
    const attempt = await this.lockAndLoadAttempt(transaction, attemptId);
    if (
      attempt.providerPaymentReference !== null &&
      attempt.providerPaymentReference !== providerPaymentReference
    ) {
      throw new BadRequestException(PAYMENT_UNAVAILABLE);
    }
    if (attempt.providerPaymentReference === null) {
      if (
        attempt.status !== 'PENDING' &&
        attempt.status !== 'RECONCILIATION_REQUIRED'
      ) {
        throw new BadRequestException(PAYMENT_UNAVAILABLE);
      }
      await transaction.paymentAttempt.update({
        data: {
          pendingAt: attempt.pendingAt ?? occurredAt,
          providerPaymentReference,
          status: 'PENDING',
        },
        where: { id: attempt.id },
      });
      return this.lockAndLoadAttempt(transaction, attemptId);
    }
    return attempt;
  }
}

async function advisoryEventLock(
  transaction: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${eventId}, 0)) IS NULL AS "locked"
  `;
}

async function markReconciliation(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  occurredAt: Date,
): Promise<void> {
  await transaction.paymentAttempt.updateMany({
    data: {
      reconciliationRequiredAt: occurredAt,
      status: 'RECONCILIATION_REQUIRED',
    },
    where: {
      id: attemptId,
      status: { in: ['PREPARED', 'PENDING', 'RECONCILIATION_REQUIRED'] },
    },
  });
}

async function lockCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Cart" WHERE "id" = ${cartId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) throw new ConflictException(ATTEMPT_UNAVAILABLE);
}

async function lockProducts(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Product"
    WHERE "id" = ANY(${ids}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;
  if (rows.length !== ids.length) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
}

function requirePaymentIntentMatchesAttempt(
  paymentIntent: Stripe.PaymentIntent,
  attempt: StripeAttempt,
): void {
  if (
    paymentIntent.livemode ||
    paymentIntent.id !== attempt.providerPaymentReference ||
    paymentIntent.metadata.payment_attempt_id !== attempt.id ||
    paymentIntent.metadata.environment !== 'sandbox' ||
    paymentIntent.metadata.owner_reference !== ownerReference(attempt) ||
    paymentIntent.currency !== attempt.currency.toLowerCase() ||
    paymentIntent.amount !== attempt.totalMinor
  ) {
    throw new BadRequestException(PAYMENT_UNAVAILABLE);
  }
}

function requireSessionMatchesAttempt(
  session: CreatedStripeCheckout,
  attempt: StripeAttempt,
  requestedNow: Date,
  allowExpired = false,
): void {
  if (
    session.sessionId !== attempt.providerSessionId ||
    session.expiresAt.getTime() !==
      attempt.providerSessionExpiresAt?.getTime() ||
    !sessionPayloadMatchesAttempt(session, attempt, requestedNow, allowExpired)
  ) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
}

function requireSessionPayloadMatchesAttempt(
  session: CreatedStripeCheckout,
  attempt: StripeAttempt,
  requestedNow: Date,
  allowExpired = false,
): void {
  if (
    !sessionPayloadMatchesAttempt(session, attempt, requestedNow, allowExpired)
  ) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
}

function sessionPayloadMatchesAttempt(
  session: CreatedStripeCheckout,
  attempt: StripeAttempt,
  requestedNow: Date,
  allowExpired: boolean,
): boolean {
  return !(
    session.attemptId !== attempt.id ||
    session.ownerReference !== ownerReference(attempt) ||
    (attempt.providerPaymentReference !== null &&
      session.paymentIntentId !== attempt.providerPaymentReference) ||
    session.currency !== attempt.currency.toLowerCase() ||
    session.amountTotal !== attempt.totalMinor ||
    (!allowExpired && session.expiresAt <= requestedNow)
  );
}

function requireAttemptMetadata(metadata: Stripe.Metadata | null): string {
  if (!metadata) throw new BadRequestException(PAYMENT_UNAVAILABLE);
  const attemptId = metadata.payment_attempt_id;
  if (
    metadata.environment !== 'sandbox' ||
    !attemptId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attemptId,
    )
  ) {
    throw new BadRequestException(PAYMENT_UNAVAILABLE);
  }
  return attemptId;
}

function requireSamePayload(
  storedHash: Uint8Array,
  suppliedHash: Uint8Array,
): void {
  const stored = Buffer.from(storedHash);
  const supplied = Buffer.from(suppliedHash);
  if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
    throw new BadRequestException(PAYMENT_UNAVAILABLE);
  }
}

function providerEventObjectId(object: Stripe.Event.Data.Object): string {
  return 'id' in object && typeof object.id === 'string'
    ? object.id
    : 'unknown';
}

function providerObjectId(
  object: string | Readonly<{ id: string }> | null,
): string | null {
  return typeof object === 'string' ? object : (object?.id ?? null);
}

function shippingAddress(attempt: StripeAttempt): string {
  return [
    attempt.street,
    attempt.houseNumber,
    attempt.postalCode,
    attempt.city,
    attempt.countryCode,
  ]
    .filter((value): value is string => Boolean(value))
    .join(', ')
    .slice(0, 500);
}

function ownerReference(attempt: StripeAttempt): string {
  return attempt.userId
    ? `user:${attempt.userId}`
    : `draft:${attempt.checkoutDraftId}`;
}

function toStatusDto(attempt: StripeAttempt): StripePaymentStatusDto {
  const status =
    attempt.status === 'SUCCEEDED'
      ? 'succeeded'
      : attempt.status === 'DEFINITIVELY_FAILED'
        ? 'failed'
        : attempt.status === 'CANCELLED'
          ? 'cancelled'
          : attempt.status === 'PREPARED' ||
              (attempt.status === 'PENDING' && !attempt.providerSessionId)
            ? 'processing'
            : attempt.status === 'PENDING'
              ? 'ready_for_redirect'
              : 'processing';
  return { attemptId: attempt.id, status };
}
