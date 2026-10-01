import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { ActiveCartAccess } from '../cart/cart-request';
import { verifyCheckoutCapability } from '../checkout/checkout-capability-token';
import { PrismaService } from '../database/prisma.service';
import type {
  PurchaseLikeCountDto,
  PurchaseLikeResponseDto,
} from './dto/purchase-like-count.dto';

const INELIGIBLE = Object.freeze({ status: 'like-ineligible' as const });

@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  async count(): Promise<PurchaseLikeCountDto> {
    return { count: await this.prisma.purchaseLike.count() };
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

    // Both unique relations make a retry (including concurrent retries) return
    // the same earned action instead of incrementing the public total twice.
    await this.prisma.purchaseLike.upsert({
      create: { orderId, paymentAttemptId },
      update: {},
      where: { paymentAttemptId },
    });
    return { ...(await this.count()), liked: true };
  }
}
