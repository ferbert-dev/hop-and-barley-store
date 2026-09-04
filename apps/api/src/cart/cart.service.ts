import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  addMoneyMinor,
  calculateLineTotalMinor,
  isValidOrderAmount,
  type ProductAmountRules,
} from '../catalog/product-amount';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { isPublicProductEligible } from '../catalog/product-public-eligibility';
import type {
  ActiveAccountCart,
  ActiveCartAccess,
  ActiveCartCapability,
} from './cart-request';
import { generateCartToken, hashCartToken } from './cart-token';
import { runCartSerializable } from './cart-transaction';
import { checkoutLineOutcome } from './checkout-readiness';
import type {
  AddCartItemDto,
  UpdateCartItemDto,
} from './dto/cart-mutation.dto';
import type {
  CartDto,
  CartItemDto,
  CheckoutReadinessDto,
} from './dto/cart-response.dto';

const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_DISTINCT_ITEMS = 50;
const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });
const NOT_FOUND = Object.freeze({ status: 'not-found' as const });

const cartSelect = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      product: {
        select: {
          activeFrom: true,
          activeUntil: true,
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

const cartProductSelect = {
  activeFrom: true,
  activeUntil: true,
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
} satisfies Prisma.ProductSelect;

type StoredCart = Prisma.CartGetPayload<{ select: typeof cartSelect }>;
type CartProduct = Prisma.ProductGetPayload<{
  select: typeof cartProductSelect;
}>;

export type CreatedCart = Readonly<{
  cart: CartDto;
  expiresAt: Date;
  rawToken: string;
}>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  empty(): CartDto {
    return {
      currency: 'EUR',
      distinctItemCount: 0,
      items: [],
      subtotalMinor: 0,
    };
  }

  async authenticate(
    rawToken: string,
    now = new Date(),
  ): Promise<ActiveCartCapability | null> {
    const cart = await this.prisma.cart.findFirst({
      select: { expiresAt: true, id: true },
      where: { tokenDigest: toPrismaBytes(rawToken), userId: null },
    });
    if (!cart || cart.expiresAt.getTime() <= now.getTime()) return null;
    return {
      cartId: cart.id,
      expiresAt: cart.expiresAt,
      kind: 'guest',
      rawToken,
    };
  }

  async authenticateAccount(
    userId: string,
    rawSessionToken: string,
  ): Promise<ActiveAccountCart | null> {
    const cart = await this.prisma.cart.findUnique({
      select: { id: true },
      where: { userId },
    });
    return cart
      ? { cartId: cart.id, kind: 'account', rawToken: rawSessionToken, userId }
      : null;
  }

  async createAccountCart(
    userId: string,
    rawSessionToken: string,
    requestedNow = new Date(),
  ): Promise<ActiveAccountCart> {
    const cartId = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        await lockActiveUser(transaction, userId);
        const existing = await transaction.cart.findUnique({
          select: { id: true },
          where: { userId },
        });
        if (existing) return existing.id;
        return (
          await transaction.cart.create({
            data: {
              expiresAt: new Date(requestedNow.getTime() + CART_LIFETIME_MS),
              tokenDigest: toPrismaBytes(generateCartToken()),
              userId,
            },
            select: { id: true },
          })
        ).id;
      },
    );
    return {
      cartId,
      kind: 'account',
      rawToken: rawSessionToken,
      userId,
    };
  }

  async mergeGuestIntoAccount(
    userId: string,
    rawGuestToken: string | null,
    requestedNow = new Date(),
  ): Promise<'not_present' | 'succeeded'> {
    const guestDigest = rawGuestToken ? toPrismaBytes(rawGuestToken) : null;
    return runCartSerializable(this.prisma, async (transaction) => {
      await lockActiveUser(transaction, userId);
      const candidates = await transaction.cart.findMany({
        select: { id: true },
        where: {
          OR: [
            { userId },
            ...(guestDigest
              ? [{ tokenDigest: guestDigest, userId: null }]
              : []),
          ],
        },
      });
      await lockCarts(
        transaction,
        candidates.map(({ id }) => id),
      );

      const account = await transaction.cart.findUnique({
        select: { id: true },
        where: { userId },
      });
      const guest = guestDigest
        ? await transaction.cart.findFirst({
            select: {
              expiresAt: true,
              id: true,
              order: { select: { id: true } },
            },
            where: { tokenDigest: guestDigest, userId: null },
          })
        : null;
      const activeGuest =
        guest &&
        guest.order === null &&
        guest.expiresAt.getTime() > requestedNow.getTime()
          ? guest
          : null;

      if (!account && activeGuest) {
        const guestItems = await transaction.cartItem.findMany({
          select: { amount: true, productId: true },
          where: { cartId: activeGuest.id },
        });
        await requireCanonicalMergedItems(
          transaction,
          new Map(
            guestItems.map(({ amount, productId }) => [productId, amount]),
          ),
        );
        await transaction.cart.update({
          data: {
            expiresAt: new Date(requestedNow.getTime() + CART_LIFETIME_MS),
            tokenDigest: toPrismaBytes(generateCartToken()),
            userId,
          },
          where: { id: activeGuest.id },
        });
        return 'succeeded';
      }

      const accountId =
        account?.id ??
        (
          await transaction.cart.create({
            data: {
              expiresAt: new Date(requestedNow.getTime() + CART_LIFETIME_MS),
              tokenDigest: toPrismaBytes(generateCartToken()),
              userId,
            },
            select: { id: true },
          })
        ).id;
      if (!activeGuest || activeGuest.id === accountId) return 'not_present';

      const [accountItems, guestItems] = await Promise.all([
        transaction.cartItem.findMany({
          select: { amount: true, productId: true },
          where: { cartId: accountId },
        }),
        transaction.cartItem.findMany({
          select: { amount: true, productId: true },
          where: { cartId: activeGuest.id },
        }),
      ]);
      const merged = new Map(
        accountItems.map(({ amount, productId }) => [productId, amount]),
      );
      for (const item of guestItems) {
        merged.set(
          item.productId,
          Math.max(merged.get(item.productId) ?? 0, item.amount),
        );
      }
      await requireCanonicalMergedItems(transaction, merged);
      for (const [productId, amount] of merged) {
        await transaction.cartItem.upsert({
          create: { amount, cartId: accountId, productId },
          update: { amount },
          where: { cartId_productId: { cartId: accountId, productId } },
        });
      }
      await transaction.cart.delete({ where: { id: activeGuest.id } });
      return 'succeeded';
    });
  }

  async getCart(
    capability: ActiveCartAccess,
    now = new Date(),
  ): Promise<CartDto> {
    const cart = await this.prisma.cart.findFirst({
      select: cartSelect,
      where: {
        id: capability.cartId,
        ...(capability.kind !== 'account' ? { expiresAt: { gt: now } } : {}),
      },
    });
    if (!cart) throw new UnauthorizedException(UNAUTHORIZED);
    return toCartDto(cart, now);
  }

  async createAndAdd(
    dto: AddCartItemDto,
    requestedNow?: Date,
  ): Promise<CreatedCart> {
    const now = requestedNow ?? new Date();
    const rawToken = generateCartToken();
    const result = await runCartSerializable(
      this.prisma,
      async (transaction) => {
        const product = await requireCartProduct(
          transaction,
          dto.productSlug,
          now,
        );
        requireValidCartAmount(dto.amount, product);
        const expiresAt = new Date(now.getTime() + CART_LIFETIME_MS);
        const created = await transaction.cart.create({
          data: { expiresAt, tokenDigest: toPrismaBytes(rawToken) },
          select: { id: true },
        });
        await transaction.cartItem.create({
          data: {
            amount: dto.amount,
            cartId: created.id,
            productId: product.id,
          },
        });
        return {
          cart: await loadCart(transaction, created.id),
          expiresAt,
        };
      },
    );
    return {
      cart: toCartDto(result.cart, now),
      expiresAt: result.expiresAt,
      rawToken,
    };
  }

  async add(
    capability: ActiveCartAccess,
    dto: AddCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCart(capability, cartExpiresAt, now);
      const product = await requireCartProduct(
        transaction,
        dto.productSlug,
        now,
      );
      const existing = await transaction.cartItem.findUnique({
        select: { amount: true, id: true },
        where: {
          cartId_productId: {
            cartId: capability.cartId,
            productId: product.id,
          },
        },
      });
      if (!existing) {
        const count = await transaction.cartItem.count({
          where: { cartId: capability.cartId },
        });
        if (count >= MAX_DISTINCT_ITEMS) unavailable();
        requireValidCartAmount(dto.amount, product);
        await transaction.cartItem.create({
          data: {
            amount: dto.amount,
            cartId: capability.cartId,
            productId: product.id,
          },
        });
      } else {
        const requestedAmount = existing.amount + dto.amount;
        requireValidCartAmount(requestedAmount, product);
        await transaction.cartItem.update({
          data: { amount: requestedAmount },
          where: { id: existing.id },
        });
      }
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart, now);
  }

  async update(
    capability: ActiveCartAccess,
    productSlug: string,
    dto: UpdateCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCart(capability, cartExpiresAt, now);
      const item = await transaction.cartItem.findFirst({
        select: {
          id: true,
          product: { select: cartProductSelect },
        },
        where: { cartId: capability.cartId, product: { slug: productSlug } },
      });
      if (!item) throw new NotFoundException(NOT_FOUND);
      if (!isPublicProductEligible(item.product, now)) unavailable();
      requireValidCartAmount(dto.amount, item.product);
      await transaction.cartItem.update({
        data: { amount: dto.amount },
        where: { id: item.id },
      });
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart, now);
  }

  async remove(
    capability: ActiveCartAccess,
    productSlug: string,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCart(capability, cartExpiresAt, now);
      const item = await transaction.cartItem.findFirst({
        select: { id: true },
        where: { cartId: capability.cartId, product: { slug: productSlug } },
      });
      if (!item) throw new NotFoundException(NOT_FOUND);
      await transaction.cartItem.delete({ where: { id: item.id } });
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart, now);
  }

  async clear(
    capability: ActiveCartAccess,
    requestedNow?: Date,
  ): Promise<CartDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCart(capability, cartExpiresAt, requestedNow ?? new Date());
      await transaction.cartItem.deleteMany({
        where: { cartId: capability.cartId },
      });
      return this.empty();
    });
  }

  async checkoutReadiness(
    capability: ActiveCartAccess,
    requestedNow?: Date,
  ): Promise<CheckoutReadinessDto> {
    const now = requestedNow ?? new Date();
    const cart = await this.prisma.cart.findFirst({
      select: cartSelect,
      where: {
        id: capability.cartId,
        ...(capability.kind !== 'account' ? { expiresAt: { gt: now } } : {}),
      },
    });
    if (!cart) throw new UnauthorizedException(UNAUTHORIZED);
    const lines = cart.items.map(({ amount, product }) => ({
      outcome: checkoutLineOutcome(product, amount, now),
      productSlug: product.slug,
      requestedAmount: amount,
    }));
    return {
      checkedAt: now.toISOString(),
      lines,
      status:
        lines.length === 0
          ? 'empty'
          : lines.every(({ outcome }) => outcome === 'available')
            ? 'ready'
            : 'unavailable',
    };
  }
}

async function requireCartProduct(
  transaction: Prisma.TransactionClient,
  slug: string,
  evaluatedAt: Date,
): Promise<CartProduct> {
  const product = await transaction.product.findUnique({
    select: cartProductSelect,
    where: { slug },
  });
  if (
    !product ||
    !isPublicProductEligible(product, evaluatedAt) ||
    product.currency !== 'EUR'
  ) {
    unavailable();
  }
  return product;
}

function requireValidCartAmount(
  requestedAmount: number,
  product: ProductAmountRules,
): void {
  if (!isValidOrderAmount(requestedAmount, product)) unavailable();
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

async function lockActiveUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User"
    WHERE "id" = ${userId}::uuid AND "status" = 'ACTIVE'
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new UnauthorizedException(UNAUTHORIZED);
}

async function lockCarts(
  transaction: Prisma.TransactionClient,
  cartIds: string[],
): Promise<void> {
  if (cartIds.length === 0) return;
  const ordered = [...cartIds].sort();
  await transaction.$queryRaw`
    SELECT "id" FROM "Cart"
    WHERE "id" = ANY(${ordered}::uuid[])
    ORDER BY "id"
    FOR UPDATE
  `;
}

async function requireCanonicalMergedItems(
  transaction: Prisma.TransactionClient,
  merged: ReadonlyMap<string, number>,
): Promise<void> {
  if (merged.size > MAX_DISTINCT_ITEMS) unavailable();
  const products = await transaction.product.findMany({
    select: {
      amountUnit: true,
      maximumOrderAmount: true,
      minimumOrderAmount: true,
      orderStepAmount: true,
      saleKind: true,
      id: true,
    },
    where: { id: { in: [...merged.keys()] } },
  });
  if (products.length !== merged.size) unavailable();
  for (const product of products) {
    requireValidCartAmount(merged.get(product.id) ?? 0, product);
  }
}

function requireActiveCart(
  capability: ActiveCartAccess,
  expiresAt: Date,
  now: Date,
): void {
  if (capability.kind !== 'account' && expiresAt.getTime() <= now.getTime()) {
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

function toCartDto(cart: StoredCart, evaluatedAt: Date): CartDto {
  const items: CartItemDto[] = cart.items.map(({ product, amount }) => {
    const isEurActive =
      isPublicProductEligible(product, evaluatedAt) &&
      product.currency === 'EUR';
    let priceMinor = isEurActive ? product.priceMinor : null;
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
      amount,
      amountUnit: product.amountUnit,
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
      saleKind: product.saleKind,
      stockAmount: product.stockAmount,
    };
  });
  let subtotalMinor = 0;
  for (const item of items) {
    if (item.lineTotalMinor === null) continue;
    try {
      subtotalMinor = addMoneyMinor(subtotalMinor, item.lineTotalMinor);
    } catch {
      subtotalMinor = 0;
      break;
    }
  }
  return {
    currency: 'EUR',
    distinctItemCount: items.length,
    items,
    subtotalMinor,
  };
}

function unavailable(): never {
  throw new UnprocessableEntityException(UNAVAILABLE);
}

function toPrismaBytes(rawToken: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hashCartToken(rawToken));
}
