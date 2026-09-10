import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkoutLineOutcome } from '../cart/checkout-readiness';
import { runCartSerializable } from '../cart/cart-transaction';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
} from '../catalog/product-amount';
import {
  calculateCheckoutPricing,
  FIRST_PURCHASE_DISCOUNT_POLICY_VERSION,
} from '../checkout/checkout-pricing';
import { verifyCheckoutCapability } from '../checkout/checkout-capability-token';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const ATTEMPT_UNAVAILABLE = Object.freeze({
  status: 'payment-attempt-unavailable' as const,
});
const IDEMPOTENCY_CONFLICT = Object.freeze({
  status: 'idempotency-conflict' as const,
});
const CLAIM_HELD = Object.freeze({ status: 'discount-claim-held' as const });

export type PaymentAttemptPrincipal =
  Readonly<{ kind: 'account'; userId: string }> | Readonly<{ kind: 'guest' }>;

export type PreparePaymentAttempt = Readonly<{
  cartId: string;
  checkoutDraftId: string;
  rawGuestCapability: string | null;
  idempotencyKey: string;
  principal: PaymentAttemptPrincipal;
}>;

const paymentAttemptSelect = {
  checkoutDraftId: true,
  checkoutDraftVersion: true,
  currency: true,
  discountBasisPoints: true,
  discountKind: true,
  discountMinor: true,
  discountPolicyVersion: true,
  id: true,
  idempotencyKey: true,
  itemSubtotalMinor: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
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
  quotedAt: true,
  requestHash: true,
  shippingMinor: true,
  snapshotSealedAt: true,
  status: true,
  totalMinor: true,
  userId: true,
} satisfies Prisma.PaymentAttemptSelect;

export type StoredPaymentAttempt = Prisma.PaymentAttemptGetPayload<{
  select: typeof paymentAttemptSelect;
}>;

const draftSelect = {
  additionalInfo: true,
  administrativeArea: true,
  apartmentUnit: true,
  cartId: true,
  city: true,
  countryCode: true,
  email: true,
  floor: true,
  fullName: true,
  guestCapabilityDigest: true,
  guestCapabilityExpiresAt: true,
  houseNumber: true,
  id: true,
  paymentMethod: true,
  phoneNumber: true,
  postalCode: true,
  status: true,
  street: true,
  userId: true,
  version: true,
} satisfies Prisma.CheckoutDraftSelect;

const cartLinesSelect = {
  items: {
    orderBy: [{ productId: 'asc' as const }, { id: 'asc' as const }],
    select: {
      amount: true,
      product: {
        select: {
          activeFrom: true,
          activeUntil: true,
          amountUnit: true,
          currency: true,
          id: true,
          isActive: true,
          maximumOrderAmount: true,
          minimumOrderAmount: true,
          name: true,
          orderStepAmount: true,
          priceBasisAmount: true,
          priceMinor: true,
          priceQualifier: true,
          saleKind: true,
          slug: true,
          stockAmount: true,
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

@Injectable()
export class PaymentAttemptService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    input: PreparePaymentAttempt,
    requestedNow = new Date(),
  ): Promise<StoredPaymentAttempt> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const initialDraft = await transaction.checkoutDraft.findUnique({
        select: { cartId: true, userId: true, version: true },
        where: { id: input.checkoutDraftId },
      });
      if (!initialDraft || initialDraft.cartId !== input.cartId) unauthorized();
      if (input.principal.kind === 'account') {
        await lockActiveUser(transaction, input.principal.userId);
      }
      const lockedCart = await lockCart(transaction, initialDraft.cartId);
      await lockDraft(transaction, input.checkoutDraftId);

      const draft = await transaction.checkoutDraft.findUnique({
        select: draftSelect,
        where: { id: input.checkoutDraftId },
      });
      if (!draft || draft.status !== 'PRE_PAYMENT') unauthorized();
      requirePrincipal(draft.userId, input.principal);
      requirePrincipal(lockedCart.userId, input.principal);
      if (
        input.principal.kind === 'guest' &&
        !verifyCheckoutCapability(
          input.rawGuestCapability,
          draft.guestCapabilityDigest,
          draft.guestCapabilityExpiresAt,
          requestedNow,
        )
      ) {
        unauthorized();
      }
      if (draft.paymentMethod !== 'STRIPE_DEBIT_CARD') attemptUnavailable();
      const requestHash = fingerprintAttemptRequest(
        draft.id,
        draft.version,
        input.principal,
      );
      const replay = await transaction.paymentAttempt.findUnique({
        select: paymentAttemptSelect,
        where: {
          checkoutDraftId_idempotencyKey: {
            checkoutDraftId: draft.id,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) return sameAttempt(replay, requestHash);

      const candidates = await transaction.cartItem.findMany({
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
        select: { productId: true },
        where: { cartId: draft.cartId },
      });
      if (candidates.length === 0) attemptUnavailable();
      await lockProducts(
        transaction,
        candidates.map(({ productId }) => productId),
      );
      const cart = await transaction.cart.findUnique({
        select: cartLinesSelect,
        where: { id: draft.cartId },
      });
      if (!cart || cart.items.length === 0) attemptUnavailable();

      let itemSubtotalMinor = 0;
      const items = cart.items.map((line) => {
        if (
          line.product.currency !== 'EUR' ||
          checkoutLineOutcome(line.product, line.amount, requestedNow) !==
            'available'
        ) {
          attemptUnavailable();
        }
        const lineTotalMinor = calculateLineTotalMinor(
          line.product.priceMinor,
          line.amount,
          line.product.priceBasisAmount,
        );
        itemSubtotalMinor = addMoneyMinor(itemSubtotalMinor, lineTotalMinor);
        return {
          amount: line.amount,
          amountUnit: line.product.amountUnit,
          lineTotalMinor,
          priceBasisAmount: line.product.priceBasisAmount,
          priceMinor: line.product.priceMinor,
          priceQualifier: line.product.priceQualifier,
          productId: line.product.id,
          productName: line.product.name,
          productSlug: line.product.slug,
          saleKind: line.product.saleKind,
        };
      });

      const userId =
        input.principal.kind === 'account' ? input.principal.userId : null;
      const applyDiscount = userId
        ? await canClaimFirstPurchaseDiscount(transaction, userId)
        : false;
      const pricing = calculateCheckoutPricing(
        itemSubtotalMinor,
        applyDiscount,
      );
      const created = await transaction.paymentAttempt.create({
        data: {
          additionalInfo: draft.additionalInfo,
          administrativeArea: draft.administrativeArea,
          apartmentUnit: draft.apartmentUnit,
          cancelledAt: null,
          checkoutDraftId: draft.id,
          checkoutDraftVersion: draft.version,
          city: draft.city,
          countryCode: draft.countryCode,
          currency: pricing.currency,
          definitivelyFailedAt: null,
          discountBasisPoints: pricing.discountBasisPoints,
          discountKind: applyDiscount ? 'FIRST_PURCHASE' : 'NONE',
          discountMinor: pricing.discountMinor,
          discountPolicyVersion: pricing.discountPolicyVersion,
          email: draft.email,
          floor: draft.floor,
          fullName: draft.fullName,
          houseNumber: draft.houseNumber,
          idempotencyKey: input.idempotencyKey,
          itemSubtotalMinor: pricing.itemSubtotalMinor,
          pendingAt: null,
          phoneNumber: draft.phoneNumber,
          postalCode: draft.postalCode,
          providerPaymentReference: null,
          quotedAt: requestedNow,
          reconciliationRequiredAt: null,
          requestHash,
          shippingMinor: pricing.shippingMinor,
          snapshotSealedAt: null,
          status: 'PREPARED',
          street: draft.street,
          succeededAt: null,
          totalMinor: pricing.totalMinor,
          userId,
        },
        select: { id: true },
      });
      await transaction.paymentAttemptItem.createMany({
        data: items.map((item) => ({
          ...item,
          paymentAttemptId: created.id,
        })),
      });
      const sealed = await transaction.paymentAttempt.update({
        data: { snapshotSealedAt: requestedNow },
        select: paymentAttemptSelect,
        where: { id: created.id },
      });
      if (applyDiscount && userId) {
        await transaction.firstPurchaseDiscountClaim.create({
          data: {
            heldAt: requestedNow,
            paymentAttemptId: sealed.id,
            userId,
          },
        });
      }
      if (
        sealed.discountKind === 'FIRST_PURCHASE' &&
        sealed.discountPolicyVersion !== FIRST_PURCHASE_DISCOUNT_POLICY_VERSION
      ) {
        throw new Error('Discount policy snapshot invariant failed');
      }
      return sealed;
    });
  }

  async markPending(
    attemptId: string,
    providerPaymentReference: string,
    occurredAt = new Date(),
  ): Promise<void> {
    const reference = providerPaymentReference.trim();
    if (!reference) throw new RangeError('Provider reference is required');
    await runCartSerializable(this.prisma, async (transaction) => {
      const attempt = await lockAttempt(transaction, attemptId);
      if (
        attempt.providerPaymentReference !== null &&
        attempt.providerPaymentReference !== reference
      ) {
        throw new ConflictException(ATTEMPT_UNAVAILABLE);
      }
      if (
        attempt.providerPaymentReference === reference &&
        attempt.status === 'PENDING'
      ) {
        return;
      }
      const updated = await transaction.paymentAttempt.updateMany({
        data: {
          pendingAt: occurredAt,
          providerPaymentReference: reference,
          status: 'PENDING',
        },
        where: {
          id: attemptId,
          status: { in: ['PREPARED', 'PENDING', 'RECONCILIATION_REQUIRED'] },
        },
      });
      if (updated.count !== 1) throw new ConflictException(ATTEMPT_UNAVAILABLE);
    });
  }

  async markProviderSessionCreated(
    attemptId: string,
    providerSessionId: string,
    providerSessionExpiresAt: Date,
    occurredAt = new Date(),
  ): Promise<void> {
    const sessionId = providerSessionId.trim();
    if (!sessionId) {
      throw new RangeError('Provider session reference is required');
    }
    await runCartSerializable(this.prisma, async (transaction) => {
      await lockAttempt(transaction, attemptId);
      const stored = await transaction.paymentAttempt.findUniqueOrThrow({
        select: {
          pendingAt: true,
          providerPaymentReference: true,
          providerSessionExpiresAt: true,
          providerSessionId: true,
          status: true,
        },
        where: { id: attemptId },
      });
      const exactSession =
        stored.providerSessionId === sessionId &&
        stored.providerSessionExpiresAt?.getTime() ===
          providerSessionExpiresAt.getTime();
      if (stored.providerSessionId !== null && !exactSession) {
        throw new ConflictException(ATTEMPT_UNAVAILABLE);
      }
      if (
        stored.providerSessionId === null &&
        stored.providerSessionExpiresAt
      ) {
        throw new ConflictException(ATTEMPT_UNAVAILABLE);
      }
      const updated = await transaction.paymentAttempt.updateMany({
        data: {
          pendingAt: stored.pendingAt ?? occurredAt,
          providerSessionExpiresAt,
          providerSessionId: sessionId,
          reconciliationRequiredAt: null,
          status: 'PENDING',
        },
        where: {
          id: attemptId,
          status: { in: ['PREPARED', 'PENDING', 'RECONCILIATION_REQUIRED'] },
        },
      });
      if (updated.count !== 1) throw new ConflictException(ATTEMPT_UNAVAILABLE);
    });
  }

  async markReconciliationRequired(
    attemptId: string,
    occurredAt = new Date(),
  ): Promise<void> {
    await runCartSerializable(this.prisma, async (transaction) => {
      await lockAttempt(transaction, attemptId);
      const updated = await transaction.paymentAttempt.updateMany({
        data: {
          reconciliationRequiredAt: occurredAt,
          status: 'RECONCILIATION_REQUIRED',
        },
        where: {
          id: attemptId,
          status: {
            in: ['PREPARED', 'PENDING', 'RECONCILIATION_REQUIRED'],
          },
        },
      });
      if (updated.count !== 1) throw new ConflictException(ATTEMPT_UNAVAILABLE);
    });
  }

  async releaseDefinitiveOutcome(
    attemptId: string,
    outcome: 'cancelled_unpaid' | 'failed',
    occurredAt = new Date(),
  ): Promise<void> {
    await runCartSerializable(this.prisma, async (transaction) => {
      await releasePaymentAttemptDefinitiveOutcome(
        transaction,
        attemptId,
        outcome,
        occurredAt,
      );
    });
  }
}

export async function releasePaymentAttemptDefinitiveOutcome(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  outcome: 'cancelled_unpaid' | 'failed',
  occurredAt: Date,
): Promise<void> {
  const attempt = await lockAttempt(transaction, attemptId);
  if (
    attempt.status === 'SUCCEEDED' ||
    attempt.status === 'DEFINITIVELY_FAILED' ||
    attempt.status === 'CANCELLED'
  ) {
    if (
      (outcome === 'failed' && attempt.status === 'DEFINITIVELY_FAILED') ||
      (outcome === 'cancelled_unpaid' && attempt.status === 'CANCELLED')
    ) {
      return;
    }
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  await transaction.paymentAttempt.update({
    data:
      outcome === 'failed'
        ? {
            definitivelyFailedAt: occurredAt,
            status: 'DEFINITIVELY_FAILED',
          }
        : { cancelledAt: occurredAt, status: 'CANCELLED' },
    where: { id: attemptId },
  });
  await transaction.firstPurchaseDiscountClaim.updateMany({
    data: {
      releaseReason:
        outcome === 'failed'
          ? 'DEFINITIVE_PAYMENT_FAILED'
          : 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID',
      releasedAt: occurredAt,
      status: 'RELEASED',
    },
    where: { paymentAttemptId: attemptId, status: 'CLAIMED' },
  });
}

export async function markPaymentAttemptSucceeded(
  transaction: Prisma.TransactionClient,
  attemptId: string,
  orderId: string,
  occurredAt: Date,
): Promise<void> {
  const initial = await transaction.paymentAttempt.findUnique({
    select: { userId: true },
    where: { id: attemptId },
  });
  if (!initial) throw new ConflictException(ATTEMPT_UNAVAILABLE);
  if (initial.userId) await lockUser(transaction, initial.userId);
  const attempt = await lockAttempt(transaction, attemptId);
  const [storedAttempt, order] = await Promise.all([
    transaction.paymentAttempt.findUniqueOrThrow({
      select: {
        currency: true,
        discountBasisPoints: true,
        discountKind: true,
        discountMinor: true,
        discountPolicyVersion: true,
        itemSubtotalMinor: true,
        items: {
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
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
        providerPaymentReference: true,
        shippingMinor: true,
        totalMinor: true,
        userId: true,
      },
      where: { id: attemptId },
    }),
    transaction.order.findUnique({
      select: {
        currency: true,
        discountBasisPoints: true,
        discountKind: true,
        discountMinor: true,
        discountPolicyVersion: true,
        id: true,
        itemSubtotalMinor: true,
        items: {
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
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
        paymentAttemptId: true,
        paymentMethod: true,
        paymentState: true,
        paidAt: true,
        providerPaymentReference: true,
        shippingMinor: true,
        status: true,
        totalMinor: true,
        userId: true,
      },
      where: { id: orderId },
    }),
  ]);
  if (
    !order ||
    !successfulOrderMatchesAttempt(order, storedAttempt, attemptId)
  ) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  if (attempt.status === 'SUCCEEDED') {
    const claim = await transaction.firstPurchaseDiscountClaim.findUnique({
      select: { consumedOrderId: true, status: true },
      where: { paymentAttemptId: attemptId },
    });
    if (
      storedAttempt.discountKind === 'NONE' ||
      (claim?.status === 'CONSUMED' && claim.consumedOrderId === orderId)
    ) {
      return;
    }
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  if (
    attempt.status !== 'PENDING' &&
    attempt.status !== 'RECONCILIATION_REQUIRED'
  ) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  await transaction.paymentAttempt.update({
    data: { status: 'SUCCEEDED', succeededAt: occurredAt },
    where: { id: attemptId },
  });
  if (storedAttempt.discountKind === 'FIRST_PURCHASE') {
    const consumed = await transaction.firstPurchaseDiscountClaim.updateMany({
      data: {
        consumedAt: occurredAt,
        consumedOrderId: orderId,
        status: 'CONSUMED',
      },
      where: { paymentAttemptId: attemptId, status: 'CLAIMED' },
    });
    if (consumed.count !== 1) {
      throw new ConflictException(ATTEMPT_UNAVAILABLE);
    }
  }
}

function successfulOrderMatchesAttempt(
  order: Readonly<{
    currency: string;
    discountBasisPoints: number;
    discountKind: 'FIRST_PURCHASE' | 'NONE';
    discountMinor: number;
    discountPolicyVersion: string;
    itemSubtotalMinor: number;
    items: ReadonlyArray<PaymentLineSnapshot>;
    paidAt: Date | null;
    paymentAttemptId: string | null;
    paymentMethod: string;
    paymentState: string;
    providerPaymentReference: string | null;
    shippingMinor: number;
    status: string;
    totalMinor: number;
    userId: string | null;
  }>,
  attempt: Readonly<{
    currency: string;
    discountBasisPoints: number;
    discountKind: 'FIRST_PURCHASE' | 'NONE';
    discountMinor: number;
    discountPolicyVersion: string;
    itemSubtotalMinor: number;
    items: ReadonlyArray<PaymentLineSnapshot>;
    providerPaymentReference: string | null;
    shippingMinor: number;
    totalMinor: number;
    userId: string | null;
  }>,
  attemptId: string,
): boolean {
  return (
    order.paymentAttemptId === attemptId &&
    order.paymentMethod === 'STRIPE_DEBIT_CARD' &&
    order.paymentState === 'PAID' &&
    order.status === 'PAID' &&
    order.paidAt !== null &&
    order.providerPaymentReference !== null &&
    order.providerPaymentReference === attempt.providerPaymentReference &&
    order.userId === attempt.userId &&
    order.currency === attempt.currency &&
    order.itemSubtotalMinor === attempt.itemSubtotalMinor &&
    order.discountKind === attempt.discountKind &&
    order.discountBasisPoints === attempt.discountBasisPoints &&
    order.discountMinor === attempt.discountMinor &&
    order.discountPolicyVersion === attempt.discountPolicyVersion &&
    order.shippingMinor === attempt.shippingMinor &&
    order.totalMinor === attempt.totalMinor &&
    samePaymentLineSnapshots(order.items, attempt.items)
  );
}

type PaymentLineSnapshot = Readonly<{
  amount: number;
  amountUnit: string;
  lineTotalMinor: number;
  priceBasisAmount: number;
  priceMinor: number;
  priceQualifier: string;
  productId: string;
  productName: string;
  productSlug: string;
  saleKind: string;
}>;

function samePaymentLineSnapshots(
  orderItems: readonly PaymentLineSnapshot[],
  attemptItems: readonly PaymentLineSnapshot[],
): boolean {
  return (
    orderItems.length === attemptItems.length &&
    orderItems.every((orderItem, index) => {
      const attemptItem = attemptItems[index];
      return (
        attemptItem !== undefined &&
        orderItem.productId === attemptItem.productId &&
        orderItem.productSlug === attemptItem.productSlug &&
        orderItem.productName === attemptItem.productName &&
        orderItem.priceQualifier === attemptItem.priceQualifier &&
        orderItem.saleKind === attemptItem.saleKind &&
        orderItem.amountUnit === attemptItem.amountUnit &&
        orderItem.priceMinor === attemptItem.priceMinor &&
        orderItem.priceBasisAmount === attemptItem.priceBasisAmount &&
        orderItem.amount === attemptItem.amount &&
        orderItem.lineTotalMinor === attemptItem.lineTotalMinor
      );
    })
  );
}

async function canClaimFirstPurchaseDiscount(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const [paidOrder, activeClaim] = await Promise.all([
    transaction.order.findFirst({
      select: { id: true },
      where: { paymentState: 'PAID', userId },
    }),
    transaction.firstPurchaseDiscountClaim.findFirst({
      select: { status: true },
      where: { status: { in: ['CLAIMED', 'CONSUMED'] }, userId },
    }),
  ]);
  if (paidOrder || activeClaim?.status === 'CONSUMED') return false;
  if (activeClaim) throw new ConflictException(CLAIM_HELD);
  return true;
}

async function lockActiveUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<
    Array<{ id: string; status: string }>
  >`
    SELECT "id", "status"::text AS "status"
    FROM "User"
    WHERE "id" = ${userId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1 || rows[0].status !== 'ACTIVE') unauthorized();
}

async function lockUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) throw new ConflictException(ATTEMPT_UNAVAILABLE);
}

async function lockCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<{ userId: string | null }> {
  const rows = await transaction.$queryRaw<
    Array<{ id: string; userId: string | null }>
  >`
    SELECT "id", "userId"
    FROM "Cart"
    WHERE "id" = ${cartId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) unauthorized();
  return { userId: rows[0].userId };
}

async function lockDraft(
  transaction: Prisma.TransactionClient,
  draftId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "CheckoutDraft" WHERE "id" = ${draftId}::uuid FOR UPDATE
  `;
  if (rows.length !== 1) unauthorized();
}

async function lockProducts(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Product"
    WHERE "id" = ANY(${ids}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;
  if (rows.length !== ids.length) attemptUnavailable();
}

async function lockAttempt(
  transaction: Prisma.TransactionClient,
  attemptId: string,
): Promise<{
  providerPaymentReference: string | null;
  snapshotSealedAt: Date | null;
  status: string;
}> {
  const rows = await transaction.$queryRaw<
    Array<{
      id: string;
      providerPaymentReference: string | null;
      snapshotSealedAt: Date | null;
      status: string;
    }>
  >`
    SELECT
      "id",
      "providerPaymentReference",
      "snapshotSealedAt",
      "status"::text AS "status"
    FROM "PaymentAttempt"
    WHERE "id" = ${attemptId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1 || rows[0].snapshotSealedAt === null) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  return rows[0];
}

function requirePrincipal(
  storedUserId: string | null,
  principal: PaymentAttemptPrincipal,
): void {
  if (
    (principal.kind === 'account' && storedUserId !== principal.userId) ||
    (principal.kind === 'guest' && storedUserId !== null)
  ) {
    unauthorized();
  }
}

function fingerprintAttemptRequest(
  draftId: string,
  draftVersion: number,
  principal: PaymentAttemptPrincipal,
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    createHash('sha256')
      .update(
        JSON.stringify({
          draftId,
          draftVersion,
          owner:
            principal.kind === 'account'
              ? { userId: principal.userId }
              : { guest: true },
        }),
      )
      .digest(),
  );
}

function sameAttempt(
  stored: StoredPaymentAttempt,
  expectedHash: Uint8Array,
): StoredPaymentAttempt {
  if (stored.snapshotSealedAt === null) {
    throw new ConflictException(ATTEMPT_UNAVAILABLE);
  }
  const existing = Buffer.from(stored.requestHash);
  const expected = Buffer.from(expectedHash);
  if (
    existing.length !== expected.length ||
    !timingSafeEqual(existing, expected)
  ) {
    throw new ConflictException(IDEMPOTENCY_CONFLICT);
  }
  return stored;
}

function unauthorized(): never {
  throw new UnauthorizedException(UNAUTHORIZED);
}

function attemptUnavailable(): never {
  throw new UnprocessableEntityException(ATTEMPT_UNAVAILABLE);
}
