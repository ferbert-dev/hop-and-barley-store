import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
} from '../catalog/product-amount';
import { checkoutLineOutcome } from '../cart/checkout-readiness';
import type { CheckoutReadinessLineDto } from '../cart/dto/cart-response.dto';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  CheckoutPaymentMethod,
  type CreateOrderDto,
} from './dto/create-order.dto';
import type { OrderDto } from './dto/order-response.dto';
import { runOrderSerializable } from './order-transaction';

const SHIPPING_MINOR = 500;
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

export type OrderCheckoutContext = Readonly<{
  cartId: string;
  idempotencyKey: string;
  userId: string;
}>;

type CheckoutLine = Readonly<{
  id: string;
  product: Readonly<{
    activeFrom: Date | null;
    activeUntil: Date | null;
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
    stockAmount: number;
  }>;
  amount: number;
}>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    context: OrderCheckoutContext,
    suppliedCheckout: CreateOrderDto,
    requestedNow?: Date,
  ): Promise<OrderDto> {
    if (
      suppliedCheckout.paymentMethod !== CheckoutPaymentMethod.CASH_ON_DELIVERY
    ) {
      throw new UnprocessableEntityException(PAYMENT_UNAVAILABLE);
    }
    const checkout = canonicalCheckout(suppliedCheckout);
    const requestHash = fingerprint(context, checkout);
    const stored = await runOrderSerializable(
      this.prisma,
      async (transaction) => {
        const replay = await findIdempotentOrder(transaction, context);
        if (replay) return sameOutcome(replay, requestHash);

        await lockActiveUser(transaction, context.userId);
        const replayAfterUserLock = await findIdempotentOrder(
          transaction,
          context,
        );
        if (replayAfterUserLock) {
          return sameOutcome(replayAfterUserLock, requestHash);
        }

        const cartAccess = await lockCart(
          transaction,
          context.cartId,
          context.userId,
        );
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
        const now = requestedNow ?? new Date();
        if (
          cartAccess.userId === null &&
          cartAccess.expiresAt.getTime() <= now.getTime()
        ) {
          allocationUnavailable(now, []);
        }
        if (candidates.length === 0) allocationUnavailable(now, []);
        await lockProducts(
          transaction,
          candidates.map(({ productId }) => productId),
        );

        const lines = await transaction.cartItem.findMany({
          orderBy: [{ productId: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
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
            amount: true,
          },
          where: { cartId: context.cartId },
        });
        const outcomes = allocationOutcomes(lines, checkout, now);
        if (outcomes.some(({ outcome }) => outcome !== 'available')) {
          allocationUnavailable(now, outcomes);
        }

        const pricedLines = lines.map((line) => ({
          ...line,
          lineTotalMinor: calculateLineTotalMinor(
            line.product.priceMinor,
            line.amount,
            line.product.priceBasisAmount,
          ),
        }));
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
          allocationUnavailable(
            now,
            outcomes.map((line) => ({
              ...line,
              outcome: 'price_unavailable',
            })),
          );
        }

        for (const line of pricedLines) {
          const allocated = await transaction.product.updateMany({
            data: { stockAmount: { decrement: line.amount } },
            where: {
              id: line.product.id,
              stockAmount: { gte: line.amount },
            },
          });
          if (allocated.count !== 1) {
            allocationUnavailable(
              now,
              outcomes.map((outcome) =>
                outcome.productSlug === line.product.slug
                  ? { ...outcome, outcome: 'insufficient_stock' }
                  : outcome,
              ),
            );
          }
        }

        const order = await transaction.order.create({
          data: {
            cartId: context.cartId,
            city: checkout.city,
            currency: 'EUR',
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
            paidAt: null,
            paymentMethod: 'CASH_ON_DELIVERY',
            paymentState: 'DUE_ON_DELIVERY',
            phoneNumber: checkout.phoneNumber,
            placedAt: now,
            providerPaymentReference: null,
            requestHash,
            shippingAddress: checkout.shippingAddress,
            shippingMinor: SHIPPING_MINOR,
            status: 'PLACED',
            totalMinor: itemSubtotalMinor + SHIPPING_MINOR,
            userId: context.userId,
          },
          select: orderSelect,
        });
        await transaction.cartItem.deleteMany({
          where: { cartId: context.cartId },
        });
        await transaction.cart.update({
          data: { updatedAt: now, userId: null },
          where: { id: context.cartId },
        });
        return order;
      },
    );
    return toOrderDto(stored);
  }
}

async function findIdempotentOrder(
  transaction: Prisma.TransactionClient,
  context: OrderCheckoutContext,
): Promise<StoredOrder | null> {
  return transaction.order.findUnique({
    select: orderSelect,
    where: {
      userId_idempotencyKey: {
        idempotencyKey: context.idempotencyKey,
        userId: context.userId,
      },
    },
  });
}

function allocationOutcomes(
  lines: readonly CheckoutLine[],
  checkout: CanonicalCheckout,
  evaluatedAt: Date,
): CheckoutReadinessLineDto[] {
  const requestedBySlug = new Map<string, number>();
  const requestCounts = new Map<string, number>();
  for (const item of checkout.items) {
    requestedBySlug.set(item.productSlug, item.amount);
    requestCounts.set(
      item.productSlug,
      (requestCounts.get(item.productSlug) ?? 0) + 1,
    );
  }
  const cartSlugs = new Set(lines.map(({ product }) => product.slug));
  const outcomes = lines.map((line) => {
    const requestedAmount =
      requestedBySlug.get(line.product.slug) ?? line.amount;
    const matches =
      requestCounts.get(line.product.slug) === 1 &&
      requestedAmount === line.amount;
    return {
      outcome: matches
        ? checkoutLineOutcome(line.product, line.amount, evaluatedAt)
        : ('invalid_amount' as const),
      productSlug: line.product.slug,
      requestedAmount,
    };
  });
  for (const item of checkout.items) {
    if (!cartSlugs.has(item.productSlug)) {
      outcomes.push({
        outcome: 'invalid_amount',
        productSlug: item.productSlug,
        requestedAmount: item.amount,
      });
    }
  }
  return outcomes.sort((left, right) =>
    left.productSlug.localeCompare(right.productSlug),
  );
}

async function lockProducts(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const orderedIds = [...new Set(productIds)].sort();
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Product"
    WHERE "id" = ANY(${orderedIds}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;
  if (rows.length !== orderedIds.length) {
    throw new Error('Cart product lock invariant failed');
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
  userId: string,
): Promise<{ expiresAt: Date; userId: string | null }> {
  const rows = await transaction.$queryRaw<
    Array<{ expiresAt: Date; id: string; userId: string | null }>
  >`
    SELECT "id", "expiresAt", "userId"
    FROM "Cart"
    WHERE "id" = ${cartId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) allocationUnavailable(new Date(), []);
  if (rows[0].userId !== null && rows[0].userId !== userId) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
  return { expiresAt: rows[0].expiresAt, userId: rows[0].userId };
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
): Uint8Array<ArrayBuffer> {
  const canonical = JSON.stringify({
    cartId: context.cartId,
    checkout,
    providerPaymentReference: null,
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

function allocationUnavailable(
  checkedAt: Date,
  lines: readonly CheckoutReadinessLineDto[],
): never {
  throw new UnprocessableEntityException({
    checkedAt: checkedAt.toISOString(),
    lines,
    status: 'allocation-unavailable',
  });
}

function toOrderDto(order: StoredOrder): OrderDto {
  return {
    currency: requireOrderCurrency(order.currency),
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

function requireOrderCurrency(currency: string): OrderDto['currency'] {
  if (currency !== 'EUR' && currency !== 'USD') {
    throw new TypeError('Stored order currency is invalid');
  }
  return currency;
}
