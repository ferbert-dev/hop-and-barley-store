import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type {
  AddCartItemDto,
  UpdateCartItemDto,
} from './dto/cart-mutation.dto';
import type { CartDto, CartItemDto } from './dto/cart-response.dto';
import type { ActiveCartCapability } from './cart-request';
import {
  activeReservedAmounts,
  createActiveReservation,
  expireReservations,
  lockProducts,
  releaseActiveReservations,
} from './cart-reservation';
import { generateCartToken, hashCartToken } from './cart-token';
import { runCartSerializable } from './cart-transaction';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
  isValidOrderAmount,
  type ProductAmountRules,
} from '../catalog/product-amount';

const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_DISTINCT_ITEMS = 50;
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });
const NOT_FOUND = Object.freeze({ status: 'not-found' as const });

const cartSelect = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      currentReservation: {
        select: { expiresAt: true, amount: true, status: true },
      },
      product: {
        select: {
          amountUnit: true,
          currency: true,
          id: true,
          imagePath: true,
          isActive: true,
          kitYieldVolumeMl: true,
          maximumOrderAmount: true,
          minimumOrderAmount: true,
          name: true,
          orderStepAmount: true,
          packageNetWeightMg: true,
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
  },
} satisfies Prisma.CartSelect;

type StoredCart = Prisma.CartGetPayload<{ select: typeof cartSelect }>;

type LockedProduct = ProductAmountRules &
  Readonly<{
    currency: string;
    id: string;
    isActive: boolean;
    stockAmount: number;
  }>;

export type CreatedCart = Readonly<{
  cart: CartDto;
  expiresAt: Date;
  rawToken: string;
}>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  empty(now = new Date(), adjustmentMessage: string | null = null): CartDto {
    return {
      adjustmentMessage,
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
      serverNow: now.toISOString(),
      subtotalMinor: 0,
    };
  }

  async authenticate(
    rawToken: string,
    now = new Date(),
  ): Promise<ActiveCartCapability | null> {
    const cart = await this.prisma.cart.findUnique({
      select: { expiresAt: true, id: true },
      where: { tokenDigest: toPrismaBytes(rawToken) },
    });
    if (!cart || cart.expiresAt.getTime() <= now.getTime()) return null;
    return { cartId: cart.id, expiresAt: cart.expiresAt, rawToken };
  }

  async getCart(
    capability: ActiveCartCapability,
    now = new Date(),
  ): Promise<CartDto> {
    const cart = await this.prisma.cart.findFirst({
      select: cartSelect,
      where: { expiresAt: { gt: now }, id: capability.cartId },
    });
    if (!cart) throw new UnauthorizedException(UNAUTHORIZED);
    return toCartDto(cart, now);
  }

  async createAndAdd(
    dto: AddCartItemDto,
    requestedNow?: Date,
  ): Promise<CreatedCart> {
    const rawToken = generateCartToken();
    const result = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const { available, now, product } = await requireReservableProduct(
          transaction,
          dto.productSlug,
          requestedNow,
        );
        const amount = canonicalPositiveAmount(dto.amount, available, product);
        const expiresAt = new Date(now.getTime() + CART_LIFETIME_MS);
        const created = await transaction.cart.create({
          data: { expiresAt, tokenDigest: toPrismaBytes(rawToken) },
          select: { id: true },
        });
        const item = await transaction.cartItem.create({
          data: {
            cartId: created.id,
            productId: product.id,
            amount,
          },
          select: { id: true },
        });
        await createActiveReservation(transaction, {
          cartId: created.id,
          cartItemId: item.id,
          now,
          productId: product.id,
          amount,
        });
        return {
          cart: await loadCart(transaction, created.id),
          clamped: amount < dto.amount,
          expiresAt,
          now,
        };
      },
    );
    return {
      cart: toCartDto(
        result.cart,
        result.now,
        result.clamped ? adjustmentMessage(true, false) : null,
      ),
      expiresAt: result.expiresAt,
      rawToken,
    };
  }

  async add(
    capability: ActiveCartCapability,
    dto: AddCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const result = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const cartExpiresAt = await lockCart(transaction, capability.cartId);
        const { available, now, product } = await requireReservableProduct(
          transaction,
          dto.productSlug,
          requestedNow,
          capability.cartId,
        );
        requireActiveCartExpiry(cartExpiresAt, now);
        const existing = await transaction.cartItem.findUnique({
          select: {
            currentReservation: {
              select: {
                expiresAt: true,
                id: true,
                amount: true,
                status: true,
              },
            },
            id: true,
            amount: true,
          },
          where: {
            cartId_productId: {
              cartId: capability.cartId,
              productId: product.id,
            },
          },
        });
        let clamped = false;
        if (!existing) {
          const count = await transaction.cartItem.count({
            where: { cartId: capability.cartId },
          });
          if (count >= MAX_DISTINCT_ITEMS) unavailable();
          const amount = canonicalPositiveAmount(
            dto.amount,
            available,
            product,
          );
          clamped = amount < dto.amount;
          const item = await transaction.cartItem.create({
            data: {
              cartId: capability.cartId,
              productId: product.id,
              amount,
            },
            select: { id: true },
          });
          await createActiveReservation(transaction, {
            cartId: capability.cartId,
            cartItemId: item.id,
            now,
            productId: product.id,
            amount,
          });
        } else {
          const currentReservation = existing.currentReservation;
          if (
            !currentReservation ||
            !isActiveReservationForAmount(
              currentReservation,
              existing.amount,
              now,
            )
          ) {
            unavailable();
          }
          const requested = existing.amount + dto.amount;
          const amount = canonicalPositiveAmount(requested, available, product);
          clamped = amount < requested;
          if (amount < existing.amount) {
            await transaction.cartItem.update({
              data: { amount },
              where: { id: existing.id },
            });
            await transaction.cartReservation.update({
              data: { amount },
              where: { id: currentReservation.id },
            });
          } else if (amount > existing.amount) {
            await releaseActiveReservations(
              transaction,
              capability.cartId,
              [existing.id],
              now,
            );
            await transaction.cartItem.update({
              data: { amount },
              where: { id: existing.id },
            });
            await createActiveReservation(transaction, {
              cartId: capability.cartId,
              cartItemId: existing.id,
              now,
              productId: product.id,
              amount,
            });
          }
        }
        return {
          cart: await loadCart(transaction, capability.cartId),
          clamped,
          now,
        };
      },
    );
    return toCartDto(
      result.cart,
      result.now,
      result.clamped ? adjustmentMessage(true, false) : null,
    );
  }

  async update(
    capability: ActiveCartCapability,
    productSlug: string,
    dto: UpdateCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const result = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const cartExpiresAt = await lockCart(transaction, capability.cartId);
        const candidate = await transaction.cartItem.findFirst({
          select: { id: true, productId: true },
          where: { cartId: capability.cartId, product: { slug: productSlug } },
        });
        if (!candidate) throw new NotFoundException(NOT_FOUND);
        await lockProducts(transaction, [candidate.productId]);
        const now = requestedNow ?? new Date();
        requireActiveCartExpiry(cartExpiresAt, now);
        await expireReservations(transaction, now, [candidate.productId]);
        const item = await transaction.cartItem.findUniqueOrThrow({
          select: {
            currentReservation: {
              select: {
                expiresAt: true,
                id: true,
                amount: true,
                status: true,
              },
            },
            id: true,
            product: {
              select: {
                currency: true,
                id: true,
                isActive: true,
                maximumOrderAmount: true,
                minimumOrderAmount: true,
                orderStepAmount: true,
                stockAmount: true,
              },
            },
            amount: true,
          },
          where: { id: candidate.id },
        });
        if (dto.amount === item.amount) {
          return {
            cart: await loadCart(transaction, capability.cartId),
            clamped: false,
            now,
          };
        }
        canonicalPositiveAmount(
          dto.amount,
          item.product.stockAmount,
          item.product,
        );
        if (dto.amount < item.amount) {
          if (
            item.currentReservation?.status === 'ACTIVE' &&
            !isActiveReservationForAmount(
              item.currentReservation,
              item.amount,
              now,
            )
          ) {
            unavailable();
          }
          await transaction.cartItem.update({
            data: { amount: dto.amount },
            where: { id: item.id },
          });
          if (item.currentReservation?.status === 'ACTIVE') {
            await transaction.cartReservation.update({
              data: { amount: dto.amount },
              where: { id: item.currentReservation.id },
            });
          }
          return {
            cart: await loadCart(transaction, capability.cartId),
            clamped: false,
            now,
          };
        }

        const currentReservation = item.currentReservation;
        if (
          !currentReservation ||
          !isActiveReservationForAmount(currentReservation, item.amount, now) ||
          !item.product.isActive ||
          item.product.currency !== 'USD'
        ) {
          unavailable();
        }
        const active = await activeReservedAmounts(
          transaction,
          [item.product.id],
          now,
          capability.cartId,
        );
        const available = Math.max(
          0,
          item.product.stockAmount - (active.get(item.product.id) ?? 0),
        );
        const amount = canonicalPositiveAmount(
          dto.amount,
          available,
          item.product,
        );
        const clamped = amount < dto.amount;
        if (amount < item.amount) {
          await transaction.cartItem.update({
            data: { amount },
            where: { id: item.id },
          });
          await transaction.cartReservation.update({
            data: { amount },
            where: { id: currentReservation.id },
          });
        } else if (amount > item.amount) {
          await releaseActiveReservations(
            transaction,
            capability.cartId,
            [item.id],
            now,
          );
          await transaction.cartItem.update({
            data: { amount },
            where: { id: item.id },
          });
          await createActiveReservation(transaction, {
            cartId: capability.cartId,
            cartItemId: item.id,
            now,
            productId: item.product.id,
            amount,
          });
        }
        return {
          cart: await loadCart(transaction, capability.cartId),
          clamped,
          now,
        };
      },
    );
    return toCartDto(
      result.cart,
      result.now,
      result.clamped ? adjustmentMessage(true, false) : null,
    );
  }

  async remove(
    capability: ActiveCartCapability,
    productSlug: string,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const result = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const cartExpiresAt = await lockCart(transaction, capability.cartId);
        const item = await transaction.cartItem.findFirst({
          select: { id: true, productId: true },
          where: { cartId: capability.cartId, product: { slug: productSlug } },
        });
        if (!item) throw new NotFoundException(NOT_FOUND);
        await lockProducts(transaction, [item.productId]);
        const now = requestedNow ?? new Date();
        requireActiveCartExpiry(cartExpiresAt, now);
        await expireReservations(transaction, now, [item.productId]);
        await releaseActiveReservations(
          transaction,
          capability.cartId,
          [item.id],
          now,
        );
        await transaction.cartItem.delete({ where: { id: item.id } });
        return { cart: await loadCart(transaction, capability.cartId), now };
      },
    );
    return toCartDto(result.cart, result.now);
  }

  async clear(
    capability: ActiveCartCapability,
    requestedNow?: Date,
  ): Promise<CartDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      const items = await transaction.cartItem.findMany({
        select: { id: true, productId: true },
        where: { cartId: capability.cartId },
      });
      const productIds = items.map(({ productId }) => productId);
      await lockProducts(transaction, productIds);
      const now = requestedNow ?? new Date();
      requireActiveCartExpiry(cartExpiresAt, now);
      await expireReservations(transaction, now, productIds);
      await releaseActiveReservations(
        transaction,
        capability.cartId,
        items.map(({ id }) => id),
        now,
      );
      await transaction.cartItem.deleteMany({
        where: { cartId: capability.cartId },
      });
      return this.empty(now);
    });
  }

  async recheck(
    capability: ActiveCartCapability,
    requestedNow?: Date,
  ): Promise<CartDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      const items = await transaction.cartItem.findMany({
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
        select: { id: true, productId: true, amount: true },
        where: { cartId: capability.cartId },
      });
      const productIds = items.map(({ productId }) => productId);
      await lockProducts(transaction, productIds);
      const now = requestedNow ?? new Date();
      requireActiveCartExpiry(cartExpiresAt, now);
      if (items.length === 0) return this.empty(now);
      await expireReservations(transaction, now, productIds);
      await releaseActiveReservations(
        transaction,
        capability.cartId,
        items.map(({ id }) => id),
        now,
      );
      const products = await transaction.product.findMany({
        select: {
          currency: true,
          id: true,
          isActive: true,
          maximumOrderAmount: true,
          minimumOrderAmount: true,
          orderStepAmount: true,
          stockAmount: true,
        },
        where: { id: { in: productIds } },
      });
      const reserved = await activeReservedAmounts(
        transaction,
        productIds,
        now,
        capability.cartId,
      );
      const byId = new Map(products.map((product) => [product.id, product]));
      let clamped = false;
      let unreserved = false;
      for (const item of items) {
        const product = byId.get(item.productId);
        const available = reservableAmount(product, reserved);
        if (available <= 0) {
          unreserved = true;
          continue;
        }
        const amount = maximumValidAmount(
          product,
          Math.min(item.amount, available),
        );
        if (amount === null) {
          unreserved = true;
          continue;
        }
        if (amount < item.amount) {
          clamped = true;
          await transaction.cartItem.update({
            data: { amount },
            where: { id: item.id },
          });
        }
        await createActiveReservation(transaction, {
          cartId: capability.cartId,
          cartItemId: item.id,
          now,
          productId: item.productId,
          amount,
        });
      }
      const cart = await loadCart(transaction, capability.cartId);
      return toCartDto(cart, now, adjustmentMessage(clamped, unreserved));
    });
  }
}

async function requireReservableProduct(
  transaction: Prisma.TransactionClient,
  slug: string,
  requestedNow?: Date,
  excludedCartId?: string,
): Promise<{ available: number; now: Date; product: LockedProduct }> {
  const candidate = await transaction.product.findUnique({
    select: { id: true },
    where: { slug },
  });
  if (!candidate) unavailable();
  await lockProducts(transaction, [candidate.id]);
  const now = requestedNow ?? new Date();
  await expireReservations(transaction, now, [candidate.id]);
  const product = await transaction.product.findUniqueOrThrow({
    select: {
      currency: true,
      id: true,
      isActive: true,
      maximumOrderAmount: true,
      minimumOrderAmount: true,
      orderStepAmount: true,
      stockAmount: true,
    },
    where: { id: candidate.id },
  });
  if (!product.isActive || product.currency !== 'USD') unavailable();
  const reserved = await activeReservedAmounts(
    transaction,
    [product.id],
    now,
    excludedCartId,
  );
  return {
    available: Math.max(
      0,
      product.stockAmount - (reserved.get(product.id) ?? 0),
    ),
    now,
    product,
  };
}

async function lockCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<Date> {
  const rows = await transaction.$queryRaw<
    Array<{ expiresAt: Date; hasOrder: boolean; id: string }>
  >`
    SELECT
      cart."id",
      cart."expiresAt",
      EXISTS (
        SELECT 1 FROM "Order" placed WHERE placed."cartId" = cart."id"
      ) AS "hasOrder"
    FROM "Cart" cart
    WHERE cart."id" = ${cartId}::uuid
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new UnauthorizedException(UNAUTHORIZED);
  if (rows[0].hasOrder) unavailable();
  return rows[0].expiresAt;
}

function requireActiveCartExpiry(expiresAt: Date, now: Date): void {
  if (expiresAt.getTime() <= now.getTime()) {
    throw new UnauthorizedException(UNAUTHORIZED);
  }
}

async function loadCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
): Promise<StoredCart> {
  return transaction.cart.findUniqueOrThrow({
    select: cartSelect,
    where: { id: cartId },
  });
}

function toCartDto(
  cart: StoredCart,
  now: Date,
  message: string | null = null,
): CartDto {
  const items: CartItemDto[] = cart.items.map(
    ({ currentReservation, product, amount }) => {
      const reservation = effectiveReservation(currentReservation, now);
      const isUsdActive = product.isActive && product.currency === 'USD';
      const available =
        isUsdActive &&
        reservation.status === 'active' &&
        currentReservation?.amount === amount;
      let priceMinor = isUsdActive ? product.priceMinor : null;
      let lineTotalMinor: number | null = null;
      if (priceMinor !== null) {
        try {
          lineTotalMinor = calculateLineTotalMinor(
            priceMinor,
            amount,
            product.priceBasisAmount,
          );
        } catch {
          priceMinor = null;
        }
      }
      return {
        amountUnit: product.amountUnit,
        availability:
          available && lineTotalMinor !== null ? 'available' : 'unavailable',
        imagePath: product.imagePath,
        kitYieldVolumeMl: product.kitYieldVolumeMl,
        lineTotalMinor,
        maximumOrderAmount: product.maximumOrderAmount,
        minimumOrderAmount: product.minimumOrderAmount,
        name: product.name,
        orderStepAmount: product.orderStepAmount,
        packageNetWeightMg: product.packageNetWeightMg,
        priceBasisAmount: product.priceBasisAmount,
        priceMinor,
        priceQualifier: product.priceQualifier,
        productId: product.id,
        productSlug: product.slug,
        amount,
        reservationExpiresAt: reservation.expiresAt,
        reservationStatus: reservation.status,
        saleKind: product.saleKind,
        stockAmount: product.stockAmount,
      };
    },
  );
  let subtotalMinor = 0;
  let subtotalOverflow = false;
  for (const item of items) {
    if (item.lineTotalMinor === null) continue;
    try {
      subtotalMinor = addMoneyMinor(subtotalMinor, item.lineTotalMinor);
    } catch {
      subtotalOverflow = true;
      break;
    }
  }
  return {
    adjustmentMessage: message,
    checkoutEligible:
      items.length > 0 &&
      !subtotalOverflow &&
      items.every(({ availability }) => availability === 'available'),
    currency: 'USD',
    distinctItemCount: items.length,
    items,
    serverNow: now.toISOString(),
    subtotalMinor,
  };
}

function effectiveReservation(
  reservation: StoredCart['items'][number]['currentReservation'],
  now: Date,
): Readonly<{
  expiresAt: string | null;
  status: 'active' | 'expired' | 'unreserved';
}> {
  if (!reservation) return { expiresAt: null, status: 'unreserved' };
  if (
    reservation.status === 'ACTIVE' &&
    reservation.expiresAt.getTime() > now.getTime()
  ) {
    return {
      expiresAt: reservation.expiresAt.toISOString(),
      status: 'active',
    };
  }
  if (reservation.status === 'ACTIVE' || reservation.status === 'EXPIRED') {
    return {
      expiresAt: reservation.expiresAt.toISOString(),
      status: 'expired',
    };
  }
  return { expiresAt: null, status: 'unreserved' };
}

function isActiveReservationForAmount(
  reservation: Readonly<{
    expiresAt: Date;
    amount: number;
    status: string;
  }> | null,
  amount: number,
  now: Date,
): boolean {
  return (
    reservation?.status === 'ACTIVE' &&
    reservation.expiresAt.getTime() > now.getTime() &&
    reservation.amount === amount
  );
}

function reservableAmount(
  product: LockedProduct | undefined,
  reserved: ReadonlyMap<string, number>,
): number {
  if (!product || !product.isActive || product.currency !== 'USD') return 0;
  return Math.max(0, product.stockAmount - (reserved.get(product.id) ?? 0));
}

function adjustmentMessage(
  clamped: boolean,
  unreserved: boolean,
): string | null {
  if (clamped && unreserved) {
    return 'Some quantities were reduced, and out-of-stock items could not be reserved.';
  }
  if (clamped)
    return 'Some quantities were reduced to currently available stock.';
  if (unreserved) return 'Out-of-stock items could not be reserved.';
  return null;
}

function canonicalPositiveAmount(
  requested: number,
  available: number,
  product: ProductAmountRules,
): number {
  if (!isValidOrderAmount(requested, product) || requested > available) {
    unavailable();
  }
  return requested;
}

function maximumValidAmount(
  product: ProductAmountRules | undefined,
  available: number,
): number | null {
  if (!product || available < product.minimumOrderAmount) return null;
  const bounded = Math.min(available, product.maximumOrderAmount ?? available);
  return (
    product.minimumOrderAmount +
    Math.floor(
      (bounded - product.minimumOrderAmount) / product.orderStepAmount,
    ) *
      product.orderStepAmount
  );
}

function unavailable(): never {
  throw new UnprocessableEntityException(UNAVAILABLE);
}

function toPrismaBytes(rawToken: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hashCartToken(rawToken));
}
