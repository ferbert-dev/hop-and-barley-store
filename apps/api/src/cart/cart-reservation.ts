import { UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

const RESERVATION_LIFETIME_MS = 15 * 60 * 1_000;
const UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });

export type ReservationClock = Readonly<{
  expiresAt: Date;
  reservedAt: Date;
}>;

export type ConsumedCartReservation = Readonly<{
  cartId: string;
  productId: string;
  quantity: number;
  reservationId: string;
}>;

type LockedReservation = Readonly<{
  cartId: string;
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  productId: string;
  quantity: number;
  status: 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'RELEASED';
}>;

export function reservationClock(now: Date): ReservationClock {
  const reservedAt = new Date(now.getTime());
  return {
    expiresAt: new Date(reservedAt.getTime() + RESERVATION_LIFETIME_MS),
    reservedAt,
  };
}

export async function lockProducts(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[],
): Promise<void> {
  const orderedIds = [...new Set(productIds)].sort();
  if (orderedIds.length === 0) return;
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Product"
    WHERE "id" = ANY(${orderedIds}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;
  if (rows.length !== orderedIds.length) {
    throw new UnprocessableEntityException(UNAVAILABLE);
  }
}

export async function expireReservations(
  transaction: Prisma.TransactionClient,
  now: Date,
  productIds?: readonly string[],
): Promise<void> {
  await transaction.cartReservation.updateMany({
    data: { status: 'EXPIRED' },
    where: {
      expiresAt: { lte: now },
      productId:
        productIds && productIds.length > 0
          ? { in: [...new Set(productIds)] }
          : undefined,
      status: 'ACTIVE',
    },
  });
}

export async function activeReservedQuantities(
  transaction: Prisma.TransactionClient,
  productIds: readonly string[],
  now: Date,
  excludedCartId?: string,
): Promise<Map<string, number>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const reservations = await transaction.cartReservation.findMany({
    select: { productId: true, quantity: true },
    where: {
      cartId: excludedCartId ? { not: excludedCartId } : undefined,
      expiresAt: { gt: now },
      productId: { in: ids },
      status: 'ACTIVE',
    },
  });
  const totals = new Map<string, number>();
  for (const reservation of reservations) {
    totals.set(
      reservation.productId,
      (totals.get(reservation.productId) ?? 0) + reservation.quantity,
    );
  }
  return totals;
}

export async function createActiveReservation(
  transaction: Prisma.TransactionClient,
  input: Readonly<{
    cartId: string;
    cartItemId: string;
    now: Date;
    productId: string;
    quantity: number;
  }>,
): Promise<string> {
  const clock = reservationClock(input.now);
  const reservation = await transaction.cartReservation.create({
    data: {
      cartId: input.cartId,
      cartItemId: input.cartItemId,
      expiresAt: clock.expiresAt,
      productId: input.productId,
      quantity: input.quantity,
      reservedAt: clock.reservedAt,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  await transaction.cartItem.update({
    data: { currentReservationId: reservation.id },
    where: { id: input.cartItemId },
  });
  return reservation.id;
}

export async function releaseActiveReservations(
  transaction: Prisma.TransactionClient,
  cartId: string,
  cartItemIds: readonly string[],
  now: Date,
): Promise<void> {
  const ids = [...new Set(cartItemIds)];
  if (ids.length === 0) return;
  await transaction.cartReservation.updateMany({
    data: { releasedAt: now, status: 'RELEASED' },
    where: {
      cartId,
      cartItemId: { in: ids },
      status: 'ACTIVE',
    },
  });
  await transaction.cartItem.updateMany({
    data: { currentReservationId: null },
    where: { cartId, id: { in: ids } },
  });
}

/**
 * Future order allocation may call this inside its own transaction. Reservation
 * ids are persisted by the future order before commit; repeating the same ids
 * is safe because only ACTIVE rows decrement stock and CONSUMED rows are
 * returned unchanged. This helper intentionally creates no order/payment state.
 */
export async function consumeCartReservations(
  transaction: Prisma.TransactionClient,
  reservationIds: readonly string[],
  requestedNow?: Date,
): Promise<ConsumedCartReservation[]> {
  const ids = [...new Set(reservationIds)].sort();
  if (ids.length === 0) return [];
  const candidates = await transaction.cartReservation.findMany({
    select: { id: true, productId: true },
    where: { id: { in: ids } },
  });
  if (candidates.length !== ids.length) {
    throw new UnprocessableEntityException(UNAVAILABLE);
  }
  await lockProducts(
    transaction,
    candidates.map(({ productId }) => productId),
  );
  const rows = await transaction.$queryRaw<LockedReservation[]>`
    SELECT "id", "cartId", "productId", "quantity", "status", "expiresAt", "consumedAt"
    FROM "CartReservation"
    WHERE "id" = ANY(${ids}::uuid[])
    ORDER BY "productId", "id"
    FOR UPDATE
  `;
  if (rows.length !== ids.length) {
    throw new UnprocessableEntityException(UNAVAILABLE);
  }
  const now = requestedNow ?? new Date();

  const result: ConsumedCartReservation[] = [];
  for (const row of rows) {
    if (row.status === 'CONSUMED') {
      result.push(toConsumed(row));
      continue;
    }
    if (row.status !== 'ACTIVE' || row.expiresAt.getTime() <= now.getTime()) {
      throw new UnprocessableEntityException(UNAVAILABLE);
    }
    const product = await transaction.product.updateMany({
      data: { stockQuantity: { decrement: row.quantity } },
      where: { id: row.productId, stockQuantity: { gte: row.quantity } },
    });
    if (product.count !== 1) {
      throw new UnprocessableEntityException(UNAVAILABLE);
    }
    await transaction.cartReservation.update({
      data: { consumedAt: now, status: 'CONSUMED' },
      where: { id: row.id },
    });
    result.push(toConsumed({ ...row, consumedAt: now, status: 'CONSUMED' }));
  }
  return result;
}

function toConsumed(row: LockedReservation): ConsumedCartReservation {
  return {
    cartId: row.cartId,
    productId: row.productId,
    quantity: row.quantity,
    reservationId: row.id,
  };
}
