import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import type { ActiveCartAccess } from '../cart/cart-request';
import { verifyCheckoutCapability } from '../checkout/checkout-capability-token';
import { PrismaService } from '../database/prisma.service';
import type {
  PurchaseLikeCountDto,
  PurchaseLikeResponseDto,
} from './dto/purchase-like-count.dto';

const INELIGIBLE = Object.freeze({ status: 'like-ineligible' as const });
// Product baseline: the user attests 130 real positive reactions collected
// outside the purchase flow; purchase Like rows remain the source of all
// subsequent increments.
const PUBLIC_LIKES_BASELINE = 130;

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  async count(): Promise<PurchaseLikeCountDto> {
    const aggregate = await this.prisma.purchaseLike.aggregate({
      _sum: { count: true },
    });
    return {
      count: PUBLIC_LIKES_BASELINE + (aggregate._sum.count ?? 0),
    };
  }

  async create(
    paymentAttemptId: string,
    cart: ActiveCartAccess,
    rawGuestCapability: string | null,
  ): Promise<PurchaseLikeResponseDto> {
    const eligible = await this.prisma.paymentAttempt.findFirst({
      select: {
        checkoutDraft: {
          select: {
            cartId: true,
            guestCapabilityDigest: true,
            guestCapabilityExpiresAt: true,
            userId: true,
          },
        },
        id: true,
        order: { select: { id: true } },
      },
      where: {
        id: paymentAttemptId,
        ...(cart.kind === 'account'
          ? { userId: cart.userId }
          : { checkoutDraft: { cartId: cart.cartId, userId: null } }),
        status: 'SUCCEEDED',
        order: {
          is: {
            paymentMethod: 'STRIPE_DEBIT_CARD',
            paymentState: 'PAID',
            status: 'PAID',
          },
        },
      },
    });
    const orderId = eligible?.order?.id;
    if (
      !orderId ||
      !eligible ||
      (cart.kind !== 'account' &&
        (!rawGuestCapability ||
          !verifyCheckoutCapability(
            rawGuestCapability,
            eligible.checkoutDraft.guestCapabilityDigest,
            eligible.checkoutDraft.guestCapabilityExpiresAt,
            new Date(),
          )))
    ) {
      throw new UnprocessableEntityException(INELIGIBLE);
    }

    // Keep one privacy-preserving row per purchase while atomically counting
    // every accepted press, including concurrent requests.
    const persist = () =>
      this.prisma.purchaseLike.upsert({
        create: { orderId, paymentAttemptId },
        update: { count: { increment: 1 } },
        where: { paymentAttemptId },
      });
    try {
      await persist();
    } catch (error: unknown) {
      if (!isPurchaseLikeUniqueConflict(error)) throw error;
      // A client-side first-insert race can lose after another request creates
      // the row. Retrying only the two O3L uniqueness conflicts turns this
      // accepted request into the required atomic increment.
      await persist();
    }
    return { ...(await this.count()), liked: true };
  }
}

function isPurchaseLikeUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof PrismaClientKnownRequestError) ||
    error.code !== 'P2002' ||
    !isRecord(error.meta)
  ) {
    return false;
  }
  if (isPurchaseLikeUniqueTarget(error.meta.target)) return true;

  const driver = error.meta.driverAdapterError;
  if (!isRecord(driver) || !isRecord(driver.cause)) return false;
  const cause = driver.cause;
  if (
    cause.kind !== 'UniqueConstraintViolation' ||
    !isRecord(cause.constraint)
  ) {
    return false;
  }
  return (
    isPurchaseLikeUniqueTarget(cause.constraint.index) ||
    isPurchaseLikeUniqueTarget(cause.constraint.fields)
  );
}

function isPurchaseLikeUniqueTarget(target: unknown): boolean {
  if (Array.isArray(target)) {
    return target.length === 1 && isPurchaseLikeUniqueTarget(target[0]);
  }
  return (
    target === 'PurchaseLike_paymentAttemptId_key' ||
    target === 'PurchaseLike_orderId_key' ||
    target === 'paymentAttemptId' ||
    target === 'orderId' ||
    target === '"paymentAttemptId"' ||
    target === '"orderId"'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
