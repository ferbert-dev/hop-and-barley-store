import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkoutLineOutcome } from '../cart/checkout-readiness';
import type { ActiveCartAccess } from '../cart/cart-request';
import { runCartSerializable } from '../cart/cart-transaction';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
} from '../catalog/product-amount';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CheckoutPaymentMethod } from '../orders/dto/create-order.dto';
import {
  deriveCheckoutCapability,
  hashCheckoutCapability,
} from './checkout-capability-token';
import { calculateCheckoutPricing } from './checkout-pricing';
import type {
  CheckoutDraftDto,
  SaveCheckoutDraftDto,
} from './dto/checkout-draft.dto';

const GUEST_CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_PURGE_BATCH_SIZE = 500;
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const NOT_FOUND = Object.freeze({ status: 'not-found' as const });
const IDEMPOTENCY_CONFLICT = Object.freeze({
  status: 'idempotency-conflict' as const,
});
const PAYMENT_UNAVAILABLE = Object.freeze({
  status: 'payment-unavailable' as const,
});
const QUOTE_UNAVAILABLE = Object.freeze({
  status: 'quote-unavailable' as const,
});

const checkoutDraftSelect = {
  additionalInfo: true,
  administrativeArea: true,
  apartmentUnit: true,
  cartId: true,
  city: true,
  countryCode: true,
  createdAt: true,
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
  updatedAt: true,
  userId: true,
  version: true,
} satisfies Prisma.CheckoutDraftSelect;

type StoredCheckoutDraft = Prisma.CheckoutDraftGetPayload<{
  select: typeof checkoutDraftSelect;
}>;

const checkoutQuoteSelect = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      amount: true,
      product: {
        select: {
          activeFrom: true,
          activeUntil: true,
          currency: true,
          isActive: true,
          maximumOrderAmount: true,
          minimumOrderAmount: true,
          orderStepAmount: true,
          priceBasisAmount: true,
          priceMinor: true,
          saleKind: true,
          stockAmount: true,
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

type StoredCheckoutQuote = Prisma.CartGetPayload<{
  select: typeof checkoutQuoteSelect;
}>;

type CheckoutQuote = Pick<
  CheckoutDraftDto,
  | 'currency'
  | 'discountBasisPoints'
  | 'discountMinor'
  | 'discountPolicyVersion'
  | 'itemSubtotalMinor'
  | 'quoteStatus'
  | 'quotedAt'
  | 'shippingMinor'
  | 'totalMinor'
>;

type CanonicalCheckoutDraft = Readonly<{
  additionalInfo: string | null;
  administrativeArea: string | null;
  apartmentUnit: string | null;
  city: string;
  countryCode: string;
  email: string;
  floor: string | null;
  fullName: string;
  houseNumber: string | null;
  paymentMethod: CheckoutPaymentMethod;
  phoneNumber: string;
  postalCode: string | null;
  street: string;
}>;

export type SavedCheckoutDraft = Readonly<{
  draft: CheckoutDraftDto;
  issuedCapability?: Readonly<{
    expiresAt: Date;
    issuedAt: Date;
    rawToken: string;
  }>;
}>;

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async getDraft(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
    requestedNow = new Date(),
  ): Promise<CheckoutDraftDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      await lockCart(transaction, cart, requestedNow);
      const [draft, quoteCart] = await Promise.all([
        transaction.checkoutDraft.findUnique({
          select: checkoutDraftSelect,
          where: { cartId: cart.cartId },
        }),
        transaction.cart.findUnique({
          select: checkoutQuoteSelect,
          where: { id: cart.cartId },
        }),
      ]);
      if (!draft || !quoteCart) throw new NotFoundException(NOT_FOUND);
      requireDraftAccess(draft, cart, rawGuestCapability, requestedNow);
      const claimedQuote = await findClaimedAttemptQuote(transaction, draft);
      if (claimedQuote) return toCheckoutDraftDto(draft, claimedQuote);
      const applyDiscount = await previewFirstPurchaseDiscount(
        transaction,
        draft,
      );
      return toCheckoutDraftDto(
        draft,
        buildCheckoutQuote(quoteCart, requestedNow, applyDiscount),
      );
    });
  }

  async saveDraft(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
    idempotencyKey: string,
    supplied: SaveCheckoutDraftDto,
    requestedNow = new Date(),
  ): Promise<SavedCheckoutDraft> {
    if (
      cart.kind !== 'account' &&
      supplied.paymentMethod === CheckoutPaymentMethod.CASH_ON_DELIVERY
    ) {
      throw new UnprocessableEntityException(PAYMENT_UNAVAILABLE);
    }

    const canonical = canonicalCheckoutDraft(supplied);
    const requestHash = fingerprint(cart, canonical);
    return runCartSerializable(this.prisma, async (transaction) => {
      const lockedCart = await lockCart(transaction, cart, requestedNow);
      await lockDraft(transaction, cart.cartId);
      let existing = await transaction.checkoutDraft.findUnique({
        select: checkoutDraftSelect,
        where: { cartId: cart.cartId },
      });

      const restartingExpiredGuest =
        cart.kind !== 'account' &&
        existing?.userId === null &&
        existing.guestCapabilityExpiresAt !== null &&
        existing.guestCapabilityExpiresAt.getTime() <= requestedNow.getTime();

      if (existing && !restartingExpiredGuest) {
        if (
          cart.kind === 'account' &&
          existing.userId === null &&
          lockedCart.userId === cart.userId
        ) {
          existing = await transaction.checkoutDraft.update({
            data: {
              guestCapabilityDigest: null,
              guestCapabilityExpiresAt: null,
              userId: cart.userId,
              updatedAt: requestedNow,
            },
            select: checkoutDraftSelect,
            where: { id: existing.id },
          });
        }
        const replay = await transaction.checkoutDraftRequest.findUnique({
          select: { requestHash: true, responseSnapshot: true },
          where: {
            checkoutDraftId_idempotencyKey: {
              checkoutDraftId: existing.id,
              idempotencyKey,
            },
          },
        });
        if (
          replay &&
          cart.kind !== 'account' &&
          !hasGuestDraftAccess(existing, rawGuestCapability, requestedNow)
        ) {
          requireSameRequest(replay.requestHash, requestHash);
          const recoveredCapability = deriveStoredCheckoutCapability(
            existing,
            cart.rawToken,
            idempotencyKey,
            requestHash,
          );
          return {
            draft: normalizeReplaySnapshot(replay.responseSnapshot),
            issuedCapability: {
              expiresAt: existing.guestCapabilityExpiresAt!,
              issuedAt: requestedNow,
              rawToken: recoveredCapability,
            },
          };
        }
        requireDraftAccess(existing, cart, rawGuestCapability, requestedNow);
        if (replay) {
          requireSameRequest(replay.requestHash, requestHash);
          return {
            draft: normalizeReplaySnapshot(replay.responseSnapshot),
          };
        }
        if (
          cart.kind === 'account' &&
          (await hasClaimedPaymentAttempt(transaction, existing.id))
        ) {
          throw new ConflictException({ status: 'discount-claim-held' });
        }
      }

      const issuingGuestCapability =
        cart.kind !== 'account' && (!existing || restartingExpiredGuest);
      const guestExpiresAt = issuingGuestCapability
        ? new Date(requestedNow.getTime() + GUEST_CHECKOUT_LIFETIME_MS)
        : (existing?.guestCapabilityExpiresAt ?? null);
      const candidateCapability =
        issuingGuestCapability && guestExpiresAt
          ? deriveCheckoutCapability(
              cart.rawToken,
              idempotencyKey,
              requestHash,
              guestExpiresAt,
            )
          : null;
      if (restartingExpiredGuest && existing) {
        await transaction.checkoutDraftRequest.deleteMany({
          where: { checkoutDraftId: existing.id },
        });
      }
      const ownerData =
        cart.kind === 'account'
          ? {
              guestCapabilityDigest: null,
              guestCapabilityExpiresAt: null,
              userId: cart.userId,
            }
          : issuingGuestCapability
            ? {
                guestCapabilityDigest: toPrismaBytes(candidateCapability!),
                guestCapabilityExpiresAt: guestExpiresAt!,
                userId: null,
              }
            : {
                guestCapabilityDigest: existing!.guestCapabilityDigest,
                guestCapabilityExpiresAt: existing!.guestCapabilityExpiresAt,
                userId: null,
              };
      const data = {
        ...canonicalToPrisma(canonical),
        ...ownerData,
        createdAt:
          restartingExpiredGuest || !existing
            ? requestedNow
            : existing.createdAt,
        status: 'PRE_PAYMENT' as const,
        updatedAt: requestedNow,
      };
      const saved = existing
        ? await transaction.checkoutDraft.update({
            data: { ...data, version: { increment: 1 } },
            select: checkoutDraftSelect,
            where: { id: existing.id },
          })
        : await transaction.checkoutDraft.create({
            data: { ...data, cartId: cart.cartId },
            select: checkoutDraftSelect,
          });
      const quoteCart = await transaction.cart.findUnique({
        select: checkoutQuoteSelect,
        where: { id: cart.cartId },
      });
      if (!quoteCart) throw new UnauthorizedException(UNAUTHORIZED);
      const applyDiscount = await previewFirstPurchaseDiscount(
        transaction,
        saved,
      );
      const response = toCheckoutDraftDto(
        saved,
        buildCheckoutQuote(quoteCart, requestedNow, applyDiscount),
      );
      await transaction.checkoutDraftRequest.create({
        data: {
          checkoutDraftId: saved.id,
          idempotencyKey,
          requestHash,
          responseSnapshot: response as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        draft: response,
        ...(issuingGuestCapability && candidateCapability && guestExpiresAt
          ? {
              issuedCapability: {
                expiresAt: guestExpiresAt,
                issuedAt: requestedNow,
                rawToken: candidateCapability,
              },
            }
          : {}),
      };
    });
  }

  async purgeExpiredGuestDrafts(
    cutoff = new Date(),
    batchSize = 100,
  ): Promise<Readonly<{ purgedDraftCount: number }>> {
    if (
      Number.isNaN(cutoff.getTime()) ||
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_PURGE_BATCH_SIZE
    ) {
      throw new RangeError('Invalid checkout draft purge boundary');
    }
    const purged = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH purgeable AS (
        SELECT draft."id"
        FROM "CheckoutDraft" AS draft
        WHERE draft."status" = 'PRE_PAYMENT'
          AND draft."userId" IS NULL
          AND draft."guestCapabilityExpiresAt" <= ${cutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM "Order" AS historical_order
            WHERE historical_order."cartId" = draft."cartId"
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "PaymentAttempt" AS payment_attempt
            WHERE payment_attempt."checkoutDraftId" = draft."id"
          )
        ORDER BY draft."guestCapabilityExpiresAt" ASC, draft."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      DELETE FROM "CheckoutDraft" AS draft
      USING purgeable
      WHERE draft."id" = purgeable."id"
      RETURNING draft."id"
    `;
    return { purgedDraftCount: purged.length };
  }
}

async function lockCart(
  transaction: Prisma.TransactionClient,
  capability: ActiveCartAccess,
  requestedNow: Date,
): Promise<{ userId: string | null }> {
  const rows = await transaction.$queryRaw<
    Array<{ expiresAt: Date; id: string; userId: string | null }>
  >`
    SELECT "id", "expiresAt", "userId"
    FROM "Cart"
    WHERE "id" = ${capability.cartId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new UnauthorizedException(UNAUTHORIZED);
  const row = rows[0];
  if (capability.kind === 'account') {
    if (row.userId !== capability.userId) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
  } else if (
    row.userId !== null ||
    row.expiresAt.getTime() <= requestedNow.getTime()
  ) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  return { userId: row.userId };
}

async function lockDraft(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<void> {
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "CheckoutDraft"
    WHERE "cartId" = ${cartId}::uuid
    FOR UPDATE
  `;
}

function requireDraftAccess(
  draft: StoredCheckoutDraft,
  cart: ActiveCartAccess,
  rawGuestCapability: string | null,
  requestedNow: Date,
): void {
  if (draft.status !== 'PRE_PAYMENT') {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  if (cart.kind === 'account') {
    if (draft.userId !== cart.userId) {
      throw new UnauthorizedException(UNAUTHORIZED);
    }
    return;
  }
  if (!hasGuestDraftAccess(draft, rawGuestCapability, requestedNow)) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
}

function hasGuestDraftAccess(
  draft: StoredCheckoutDraft,
  rawGuestCapability: string | null,
  requestedNow: Date,
): boolean {
  if (
    draft.userId !== null ||
    !rawGuestCapability ||
    !draft.guestCapabilityDigest ||
    !draft.guestCapabilityExpiresAt ||
    draft.guestCapabilityExpiresAt.getTime() <= requestedNow.getTime()
  ) {
    return false;
  }
  const stored = Buffer.from(draft.guestCapabilityDigest);
  const supplied = hashCheckoutCapability(rawGuestCapability);
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

function deriveStoredCheckoutCapability(
  draft: StoredCheckoutDraft,
  rawCartCapability: string,
  idempotencyKey: string,
  requestHash: Uint8Array,
): string {
  if (!draft.guestCapabilityDigest || !draft.guestCapabilityExpiresAt) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  const recovered = deriveCheckoutCapability(
    rawCartCapability,
    idempotencyKey,
    requestHash,
    draft.guestCapabilityExpiresAt,
  );
  const stored = Buffer.from(draft.guestCapabilityDigest);
  const recoveredDigest = hashCheckoutCapability(recovered);
  if (
    stored.length !== recoveredDigest.length ||
    !timingSafeEqual(stored, recoveredDigest)
  ) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  return recovered;
}

function canonicalCheckoutDraft(
  supplied: SaveCheckoutDraftDto,
): CanonicalCheckoutDraft {
  return {
    additionalInfo: supplied.delivery.additionalInfo?.trim() ?? null,
    administrativeArea:
      supplied.delivery.countryCode === 'US'
        ? (supplied.delivery.administrativeArea?.trim().toUpperCase() ?? null)
        : (supplied.delivery.administrativeArea?.trim() ?? null),
    apartmentUnit: supplied.delivery.apartmentUnit?.trim() ?? null,
    city: supplied.delivery.city.trim(),
    countryCode: supplied.delivery.countryCode.trim().toUpperCase(),
    email: supplied.email.trim().toLowerCase(),
    floor: supplied.delivery.floor?.trim() ?? null,
    fullName: supplied.fullName.trim(),
    houseNumber: supplied.delivery.houseNumber?.trim() ?? null,
    paymentMethod: supplied.paymentMethod,
    phoneNumber: supplied.phoneNumber.trim(),
    postalCode: supplied.delivery.postalCode?.trim() ?? null,
    street: supplied.delivery.street.trim(),
  };
}

function canonicalToPrisma(canonical: CanonicalCheckoutDraft) {
  return {
    additionalInfo: canonical.additionalInfo,
    administrativeArea: canonical.administrativeArea,
    apartmentUnit: canonical.apartmentUnit,
    city: canonical.city,
    countryCode: canonical.countryCode,
    email: canonical.email,
    floor: canonical.floor,
    fullName: canonical.fullName,
    houseNumber: canonical.houseNumber,
    paymentMethod:
      canonical.paymentMethod === CheckoutPaymentMethod.CASH_ON_DELIVERY
        ? ('CASH_ON_DELIVERY' as const)
        : ('STRIPE_DEBIT_CARD' as const),
    phoneNumber: canonical.phoneNumber,
    postalCode: canonical.postalCode,
    street: canonical.street,
  };
}

function fingerprint(
  cart: ActiveCartAccess,
  canonical: CanonicalCheckoutDraft,
): Uint8Array<ArrayBuffer> {
  const input = JSON.stringify({
    cartId: cart.cartId,
    owner: cart.kind === 'account' ? { userId: cart.userId } : { guest: true },
    checkout: canonical,
  });
  return Uint8Array.from(createHash('sha256').update(input).digest());
}

function requireSameRequest(
  storedHash: Uint8Array,
  requestHash: Uint8Array,
): void {
  const stored = Buffer.from(storedHash);
  const supplied = Buffer.from(requestHash);
  if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
    throw new ConflictException(IDEMPOTENCY_CONFLICT);
  }
}

function buildCheckoutQuote(
  cart: StoredCheckoutQuote,
  quotedAt: Date,
  applyFirstPurchaseDiscount: boolean,
): CheckoutQuote {
  let itemSubtotalMinor = 0;
  let quoteStatus: CheckoutQuote['quoteStatus'] =
    cart.items.length === 0 ? 'empty' : 'ready';
  try {
    for (const line of cart.items) {
      if (line.product.currency !== 'EUR') quoteUnavailable();
      if (
        checkoutLineOutcome(line.product, line.amount, quotedAt) !== 'available'
      ) {
        quoteStatus = 'unavailable';
      }
      itemSubtotalMinor = addMoneyMinor(
        itemSubtotalMinor,
        calculateLineTotalMinor(
          line.product.priceMinor,
          line.amount,
          line.product.priceBasisAmount,
        ),
      );
    }
    const pricing = calculateCheckoutPricing(
      itemSubtotalMinor,
      applyFirstPurchaseDiscount,
    );
    if (
      !Number.isSafeInteger(itemSubtotalMinor) ||
      !Number.isSafeInteger(pricing.totalMinor) ||
      itemSubtotalMinor < 0 ||
      pricing.totalMinor < 0
    ) {
      quoteUnavailable();
    }
    return {
      ...pricing,
      quoteStatus,
      quotedAt: quotedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof UnprocessableEntityException) throw error;
    quoteUnavailable();
  }
}

async function previewFirstPurchaseDiscount(
  transaction: Prisma.TransactionClient,
  draft: Pick<StoredCheckoutDraft, 'paymentMethod' | 'userId'>,
): Promise<boolean> {
  if (!draft.userId || draft.paymentMethod !== 'STRIPE_DEBIT_CARD') {
    return false;
  }
  const [paidOrder, activeClaim] = await Promise.all([
    transaction.order.findFirst({
      select: { id: true },
      where: { paymentState: 'PAID', userId: draft.userId },
    }),
    transaction.firstPurchaseDiscountClaim.findFirst({
      select: { id: true },
      where: {
        status: { in: ['CLAIMED', 'CONSUMED'] },
        userId: draft.userId,
      },
    }),
  ]);
  return !paidOrder && !activeClaim;
}

async function hasClaimedPaymentAttempt(
  transaction: Prisma.TransactionClient,
  checkoutDraftId: string,
): Promise<boolean> {
  return Boolean(
    await transaction.firstPurchaseDiscountClaim.findFirst({
      select: { id: true },
      where: {
        paymentAttempt: { checkoutDraftId },
        status: 'CLAIMED',
      },
    }),
  );
}

async function findClaimedAttemptQuote(
  transaction: Prisma.TransactionClient,
  draft: Pick<StoredCheckoutDraft, 'id' | 'userId'>,
): Promise<CheckoutQuote | null> {
  if (!draft.userId) return null;
  const claimed = await transaction.firstPurchaseDiscountClaim.findFirst({
    orderBy: { heldAt: 'desc' },
    select: {
      paymentAttempt: {
        select: {
          currency: true,
          discountBasisPoints: true,
          discountMinor: true,
          discountPolicyVersion: true,
          itemSubtotalMinor: true,
          quotedAt: true,
          shippingMinor: true,
          totalMinor: true,
        },
      },
    },
    where: {
      paymentAttempt: { checkoutDraftId: draft.id, userId: draft.userId },
      status: 'CLAIMED',
    },
  });
  if (!claimed) return null;
  const quote = claimed.paymentAttempt;
  if (quote.currency !== 'EUR') quoteUnavailable();
  return {
    currency: 'EUR',
    discountBasisPoints: quote.discountBasisPoints,
    discountMinor: quote.discountMinor,
    discountPolicyVersion: quote.discountPolicyVersion,
    itemSubtotalMinor: quote.itemSubtotalMinor,
    quoteStatus: 'ready',
    quotedAt: quote.quotedAt.toISOString(),
    shippingMinor: quote.shippingMinor,
    totalMinor: quote.totalMinor,
  };
}

function quoteUnavailable(): never {
  throw new UnprocessableEntityException(QUOTE_UNAVAILABLE);
}

function normalizeReplaySnapshot(snapshot: Prisma.JsonValue): CheckoutDraftDto {
  if (!isJsonRecord(snapshot)) quoteUnavailable();
  const hasBasisPoints = 'discountBasisPoints' in snapshot;
  const hasDiscountMinor = 'discountMinor' in snapshot;
  const hasPolicyVersion = 'discountPolicyVersion' in snapshot;
  if (hasBasisPoints || hasDiscountMinor || hasPolicyVersion) {
    if (!hasBasisPoints || !hasDiscountMinor || !hasPolicyVersion) {
      quoteUnavailable();
    }
    return snapshot as unknown as CheckoutDraftDto;
  }
  if (
    snapshot.currency !== 'EUR' ||
    !isNonNegativeInteger(snapshot.itemSubtotalMinor) ||
    !isNonNegativeInteger(snapshot.shippingMinor) ||
    !isNonNegativeInteger(snapshot.totalMinor) ||
    snapshot.totalMinor !== snapshot.itemSubtotalMinor + snapshot.shippingMinor
  ) {
    quoteUnavailable();
  }
  return {
    ...(snapshot as unknown as CheckoutDraftDto),
    discountBasisPoints: 0,
    discountMinor: 0,
    discountPolicyVersion: 'no-discount-v1',
  };
}

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(
  value: Prisma.JsonValue | undefined,
): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function toCheckoutDraftDto(
  draft: StoredCheckoutDraft,
  quote: CheckoutQuote,
): CheckoutDraftDto {
  return {
    ...quote,
    delivery: {
      additionalInfo: draft.additionalInfo,
      administrativeArea: draft.administrativeArea,
      apartmentUnit: draft.apartmentUnit,
      city: draft.city,
      countryCode: draft.countryCode,
      floor: draft.floor,
      houseNumber: draft.houseNumber,
      postalCode: draft.postalCode,
      street: draft.street,
    },
    email: draft.email,
    expiresAt: draft.guestCapabilityExpiresAt?.toISOString() ?? null,
    fullName: draft.fullName,
    paymentMethod:
      draft.paymentMethod === 'CASH_ON_DELIVERY'
        ? CheckoutPaymentMethod.CASH_ON_DELIVERY
        : CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
    phoneNumber: draft.phoneNumber,
    status: 'pre_payment',
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function toPrismaBytes(rawCapability: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hashCheckoutCapability(rawCapability));
}
