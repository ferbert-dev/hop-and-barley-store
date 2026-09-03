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
import type { ActiveCartCapability } from './cart-request';
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
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
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
    capability: ActiveCartCapability,
    dto: AddCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCartExpiry(cartExpiresAt, now);
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
    capability: ActiveCartCapability,
    productSlug: string,
    dto: UpdateCartItemDto,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCartExpiry(cartExpiresAt, now);
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
    capability: ActiveCartCapability,
    productSlug: string,
    requestedNow?: Date,
  ): Promise<CartDto> {
    const now = requestedNow ?? new Date();
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCartExpiry(cartExpiresAt, now);
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
    capability: ActiveCartCapability,
    requestedNow?: Date,
  ): Promise<CartDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      const cartExpiresAt = await lockCart(transaction, capability.cartId);
      requireActiveCartExpiry(cartExpiresAt, requestedNow ?? new Date());
      await transaction.cartItem.deleteMany({
        where: { cartId: capability.cartId },
      });
      return this.empty();
    });
  }

  async checkoutReadiness(
    capability: ActiveCartCapability,
    requestedNow?: Date,
  ): Promise<CheckoutReadinessDto> {
    const now = requestedNow ?? new Date();
    const cart = await this.prisma.cart.findFirst({
      select: cartSelect,
      where: { expiresAt: { gt: now }, id: capability.cartId },
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
    product.currency !== 'USD'
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

function toCartDto(cart: StoredCart, evaluatedAt: Date): CartDto {
  const items: CartItemDto[] = cart.items.map(({ product, amount }) => {
    const isUsdActive =
      isPublicProductEligible(product, evaluatedAt) &&
      product.currency === 'USD';
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
    currency: 'USD',
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
