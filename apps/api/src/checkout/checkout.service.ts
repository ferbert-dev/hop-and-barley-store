import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ActiveCartAccess } from '../cart/cart-request';
import { runCartSerializable } from '../cart/cart-transaction';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { CheckoutPaymentMethod } from '../orders/dto/create-order.dto';
import {
  generateCheckoutCapability,
  hashCheckoutCapability,
} from './checkout-capability-token';
import type {
  CheckoutDraftDto,
  SaveCheckoutDraftDto,
} from './dto/checkout-draft.dto';

const GUEST_CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const NOT_FOUND = Object.freeze({ status: 'not-found' as const });
const IDEMPOTENCY_CONFLICT = Object.freeze({
  status: 'idempotency-conflict' as const,
});
const PAYMENT_UNAVAILABLE = Object.freeze({
  status: 'payment-unavailable' as const,
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
  issuedCapability?: Readonly<{ expiresAt: Date; rawToken: string }>;
}>;

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async getDraft(
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
    requestedNow = new Date(),
  ): Promise<CheckoutDraftDto> {
    const draft = await this.prisma.checkoutDraft.findUnique({
      select: checkoutDraftSelect,
      where: { cartId: cart.cartId },
    });
    if (!draft) throw new NotFoundException(NOT_FOUND);
    requireDraftAccess(draft, cart, rawGuestCapability, requestedNow);
    return toCheckoutDraftDto(draft);
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
    const candidateCapability =
      cart.kind === 'account' ? null : generateCheckoutCapability();

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
        requireDraftAccess(existing, cart, rawGuestCapability, requestedNow);
        const replay = await transaction.checkoutDraftRequest.findUnique({
          select: { requestHash: true, responseSnapshot: true },
          where: {
            checkoutDraftId_idempotencyKey: {
              checkoutDraftId: existing.id,
              idempotencyKey,
            },
          },
        });
        if (replay) {
          requireSameRequest(replay.requestHash, requestHash);
          return {
            draft: replay.responseSnapshot as unknown as CheckoutDraftDto,
          };
        }
      }

      const issuingGuestCapability =
        cart.kind !== 'account' && (!existing || restartingExpiredGuest);
      const guestExpiresAt = issuingGuestCapability
        ? new Date(requestedNow.getTime() + GUEST_CHECKOUT_LIFETIME_MS)
        : (existing?.guestCapabilityExpiresAt ?? null);
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
      const response = toCheckoutDraftDto(saved);
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
                rawToken: candidateCapability,
              },
            }
          : {}),
      };
    });
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
  if (
    draft.userId !== null ||
    !rawGuestCapability ||
    !draft.guestCapabilityDigest ||
    !draft.guestCapabilityExpiresAt ||
    draft.guestCapabilityExpiresAt.getTime() <= requestedNow.getTime()
  ) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  const stored = Buffer.from(draft.guestCapabilityDigest);
  const supplied = hashCheckoutCapability(rawGuestCapability);
  if (stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
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

function toCheckoutDraftDto(draft: StoredCheckoutDraft): CheckoutDraftDto {
  return {
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
