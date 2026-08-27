import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  consumeCartReservations,
  lockProducts,
} from '../cart/cart-reservation';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type {
  OrderStatus,
  PaymentMethod,
  PaymentState,
} from '../generated/prisma/enums';
import {
  CheckoutPaymentMethod,
  type CreateOrderDto,
} from './dto/create-order.dto';
import type { OrderDto } from './dto/order-response.dto';
import { runOrderSerializable } from './order-transaction';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
  isValidOrderAmount,
} from '../catalog/product-amount';

const SHIPPING_MINOR = 500;
const UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });
const PAYMENT_UNAVAILABLE = Object.freeze({
  status: 'payment-unavailable' as const,
});
const IDEMPOTENCY_CONFLICT = Object.freeze({
  status: 'idempotency-conflict' as const,
});
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

const orderSelect = {
  city: true,
  currency: true,
  fullName: true,
  id: true,
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
      productName: true,
      productSlug: true,
      saleKind: true,
    },
  },
  paidAt: true,
  paymentMethod: true,
  paymentState: true,
  phoneNumber: true,
  placedAt: true,
  requestHash: true,
  shippingAddress: true,
  shippingMinor: true,
  status: true,
  totalMinor: true,
  userId: true,
} satisfies Prisma.OrderSelect;

type StoredOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

type CanonicalCheckout = Readonly<{
  city: string;
  fullName: string;
  items: ReadonlyArray<Readonly<{ productSlug: string; amount: number }>>;
  paymentMethod: CheckoutPaymentMethod;
  phoneNumber: string;
  shippingAddress: string;
}>;

type PaymentOutcome = Readonly<{
  paidAt: Date | null;
  paymentMethod: PaymentMethod;
  paymentState: PaymentState;
  providerPaymentReference: string | null;
  status: OrderStatus;
}>;

export type OrderCheckoutContext = Readonly<{
  cartId: string;
  idempotencyKey: string;
  userId: string;
}>;

export type VerifiedStripeFinalization = OrderCheckoutContext &
  Readonly<{
    checkout: CreateOrderDto;
    paidAt?: Date;
    providerPaymentReference: string;
  }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    context: OrderCheckoutContext,
    checkout: CreateOrderDto,
    requestedNow?: Date,
  ): Promise<OrderDto> {
    if (checkout.paymentMethod !== CheckoutPaymentMethod.CASH_ON_DELIVERY) {
      throw new UnprocessableEntityException(PAYMENT_UNAVAILABLE);
    }
    return this.finalize(
      context,
      checkout,
      {
        paidAt: null,
        paymentMethod: 'CASH_ON_DELIVERY',
        paymentState: 'DUE_ON_DELIVERY',
        providerPaymentReference: null,
        status: 'PLACED',
      },
      requestedNow,
    );
  }

  /**
   * Internal O2P boundary. The future Stripe webhook handler owns signature and
   * event verification before it may call this method. No browser route calls it.
   */
  async finalizeVerifiedStripePayment(
    input: VerifiedStripeFinalization,
    requestedNow?: Date,
  ): Promise<OrderDto> {
    if (
      input.checkout.paymentMethod !==
        CheckoutPaymentMethod.STRIPE_DEBIT_CARD ||
      input.providerPaymentReference.length < 1 ||
      input.providerPaymentReference.length > 255
    ) {
      throw new UnprocessableEntityException(PAYMENT_UNAVAILABLE);
    }
    const now = requestedNow ?? new Date();
    return this.finalize(
      input,
      input.checkout,
      {
        paidAt: input.paidAt ?? now,
        paymentMethod: 'STRIPE_DEBIT_CARD',
        paymentState: 'PAID',
        providerPaymentReference: input.providerPaymentReference,
        status: 'PAID',
      },
      requestedNow,
    );
  }

  private async finalize(
    context: OrderCheckoutContext,
    suppliedCheckout: CreateOrderDto,
    payment: PaymentOutcome,
    requestedNow?: Date,
  ): Promise<OrderDto> {
    const checkout = canonicalCheckout(suppliedCheckout);
    const requestHash = fingerprint(context, checkout, payment);

    const stored = await runOrderSerializable(
      this.prisma,
      async (transaction) => {
        await lockActiveUser(transaction, context.userId);

        const byKey = await transaction.order.findUnique({
          select: orderSelect,
          where: {
            userId_idempotencyKey: {
              idempotencyKey: context.idempotencyKey,
              userId: context.userId,
            },
          },
        });
        if (byKey) return sameOutcome(byKey, requestHash);

        if (payment.providerPaymentReference) {
          const byPayment = await transaction.order.findUnique({
            select: orderSelect,
            where: {
              providerPaymentReference: payment.providerPaymentReference,
            },
          });
          if (byPayment) return sameOutcome(byPayment, requestHash);
        }

        const cartExpiresAt = await lockCart(transaction, context.cartId);
        const byCart = await transaction.order.findUnique({
          select: orderSelect,
          where: { cartId: context.cartId },
        });
        if (byCart) return sameOutcome(byCart, requestHash);

        const candidates = await transaction.cartItem.findMany({
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
          select: { productId: true },
          where: { cartId: context.cartId },
        });
        if (candidates.length === 0) unavailable();
        await lockProducts(
          transaction,
          candidates.map(({ productId }) => productId),
        );
        const now = requestedNow ?? new Date();
        if (cartExpiresAt.getTime() <= now.getTime()) unavailable();

        const lines = await transaction.cartItem.findMany({
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
          select: {
            currentReservation: {
              select: {
                cartId: true,
                expiresAt: true,
                id: true,
                productId: true,
                amount: true,
                status: true,
              },
            },
            id: true,
            product: {
              select: {
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
              },
            },
            amount: true,
          },
          where: { cartId: context.cartId },
        });
        requireMatchingCheckout(lines, checkout, context.cartId, now);

        const pricedLines = lines.map((line) => {
          try {
            return {
              ...line,
              lineTotalMinor: calculateLineTotalMinor(
                line.product.priceMinor,
                line.amount,
                line.product.priceBasisAmount,
              ),
            };
          } catch {
            unavailable();
          }
        });
        let itemSubtotalMinor = 0;
        try {
          for (const line of pricedLines) {
            itemSubtotalMinor = addMoneyMinor(
              itemSubtotalMinor,
              line.lineTotalMinor,
            );
          }
          addMoneyMinor(itemSubtotalMinor, SHIPPING_MINOR);
        } catch {
          unavailable();
        }
        const reservationIds = lines.map((line) =>
          requiredReservationId(line.currentReservation?.id),
        );

        const order = await transaction.order.create({
          data: {
            cartId: context.cartId,
            city: checkout.city,
            currency: 'USD',
            fullName: checkout.fullName,
            idempotencyKey: context.idempotencyKey,
            itemSubtotalMinor,
            items: {
              create: pricedLines.map((line) => ({
                amount: line.amount,
                amountUnit: line.product.amountUnit,
                lineTotalMinor: line.lineTotalMinor,
                priceBasisAmount: line.product.priceBasisAmount,
                priceMinor: line.product.priceMinor,
                priceQualifier: line.product.priceQualifier,
                productId: line.product.id,
                productName: line.product.name,
                productSlug: line.product.slug,
                saleKind: line.product.saleKind,
              })),
            },
            paidAt: payment.paidAt,
            paymentMethod: payment.paymentMethod,
            paymentState: payment.paymentState,
            phoneNumber: checkout.phoneNumber,
            placedAt: now,
            providerPaymentReference: payment.providerPaymentReference,
            requestHash,
            shippingAddress: checkout.shippingAddress,
            shippingMinor: SHIPPING_MINOR,
            status: payment.status,
            totalMinor: itemSubtotalMinor + SHIPPING_MINOR,
            userId: context.userId,
          },
          select: orderSelect,
        });

        await consumeCartReservations(
          transaction,
          reservationIds,
          now,
          order.id,
        );
        await transaction.cartItem.deleteMany({
          where: { cartId: context.cartId },
        });
        await transaction.cart.update({
          data: { updatedAt: now },
          where: { id: context.cartId },
        });
        return order;
      },
    );

    return toOrderDto(stored);
  }
}

type CheckoutLine = Readonly<{
  currentReservation: Readonly<{
    cartId: string;
    expiresAt: Date;
    id: string;
    productId: string;
    amount: number;
    status: string;
  }> | null;
  id: string;
  product: Readonly<{
    amountUnit: 'EACH' | 'MILLIGRAM';
    currency: string;
    id: string;
    isActive: boolean;
    maximumOrderAmount: number | null;
    minimumOrderAmount: number;
    name: string;
    orderStepAmount: number;
    priceBasisAmount: number;
    priceMinor: number;
    priceQualifier: string;
    saleKind: 'KIT' | 'PACKAGE' | 'WEIGHT';
    slug: string;
  }>;
  amount: number;
}>;

function requireMatchingCheckout(
  lines: readonly CheckoutLine[],
  checkout: CanonicalCheckout,
  cartId: string,
  now: Date,
): void {
  const requested = new Map(
    checkout.items.map(({ productSlug, amount }) => [productSlug, amount]),
  );
  if (
    requested.size !== checkout.items.length ||
    requested.size !== lines.length
  ) {
    unavailable();
  }
  for (const line of lines) {
    const reservation = line.currentReservation;
    if (
      requested.get(line.product.slug) !== line.amount ||
      !line.product.isActive ||
      line.product.currency !== 'USD' ||
      line.product.priceMinor < 0 ||
      !isValidOrderAmount(line.amount, line.product) ||
      !reservation ||
      reservation.cartId !== cartId ||
      reservation.productId !== line.product.id ||
      reservation.amount !== line.amount ||
      reservation.status !== 'ACTIVE' ||
      reservation.expiresAt.getTime() <= now.getTime()
    ) {
      unavailable();
    }
  }
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
  if (rows.length !== 1 || rows[0].status !== 'ACTIVE') {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
}

async function lockCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<Date> {
  const rows = await transaction.$queryRaw<
    Array<{ expiresAt: Date; id: string }>
  >`
    SELECT "id", "expiresAt"
    FROM "Cart"
    WHERE "id" = ${cartId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) unavailable();
  return rows[0].expiresAt;
}

function canonicalCheckout(checkout: CreateOrderDto): CanonicalCheckout {
  return {
    city: checkout.city.trim(),
    fullName: checkout.fullName.trim(),
    items: checkout.items
      .map(({ productSlug, amount }) => ({ productSlug, amount }))
      .sort((left, right) => left.productSlug.localeCompare(right.productSlug)),
    paymentMethod: checkout.paymentMethod,
    phoneNumber: checkout.phoneNumber.trim(),
    shippingAddress: checkout.shippingAddress.trim(),
  };
}

function fingerprint(
  context: OrderCheckoutContext,
  checkout: CanonicalCheckout,
  payment: PaymentOutcome,
): Uint8Array<ArrayBuffer> {
  const canonical = JSON.stringify({
    cartId: context.cartId,
    checkout,
    providerPaymentReference: payment.providerPaymentReference,
    userId: context.userId,
  });
  return Uint8Array.from(createHash('sha256').update(canonical).digest());
}

function sameOutcome(order: StoredOrder, requestHash: Uint8Array): StoredOrder {
  const existing = Buffer.from(order.requestHash);
  const supplied = Buffer.from(requestHash);
  if (
    existing.length !== supplied.length ||
    !timingSafeEqual(existing, supplied)
  ) {
    throw new ConflictException(IDEMPOTENCY_CONFLICT);
  }
  return order;
}

function requiredReservationId(id: string | undefined): string {
  if (!id) unavailable();
  return id;
}

function unavailable(): never {
  throw new UnprocessableEntityException(UNAVAILABLE);
}

function toOrderDto(order: StoredOrder): OrderDto {
  return {
    currency: 'USD',
    id: order.id,
    itemSubtotalMinor: order.itemSubtotalMinor,
    items: order.items,
    paidAt: order.paidAt?.toISOString() ?? null,
    paymentMethod:
      order.paymentMethod === 'STRIPE_DEBIT_CARD'
        ? 'stripe_debit_card'
        : 'cash_on_delivery',
    paymentState: order.paymentState === 'PAID' ? 'paid' : 'due_on_delivery',
    placedAt: order.placedAt.toISOString(),
    shipping: {
      city: order.city,
      fullName: order.fullName,
      phoneNumber: order.phoneNumber,
      shippingAddress: order.shippingAddress,
    },
    shippingMinor: order.shippingMinor,
    status: order.status.toLowerCase() as OrderDto['status'],
    totalMinor: order.totalMinor,
  };
}
