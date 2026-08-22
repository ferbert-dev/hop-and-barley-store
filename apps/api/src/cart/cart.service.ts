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
import { generateCartToken, hashCartToken } from './cart-token';
import { runCartSerializable } from './cart-transaction';

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
          currency: true,
          id: true,
          imagePath: true,
          isActive: true,
          name: true,
          priceMinor: true,
          priceQualifier: true,
          slug: true,
          stockQuantity: true,
        },
      },
      quantity: true,
    },
  },
} satisfies Prisma.CartSelect;

type StoredCart = Prisma.CartGetPayload<{ select: typeof cartSelect }>;

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
      checkoutEligible: false,
      currency: 'USD',
      distinctItemCount: 0,
      items: [],
      subtotalMinor: 0,
      totalQuantity: 0,
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

  async getCart(capability: ActiveCartCapability): Promise<CartDto> {
    const cart = await this.prisma.cart.findFirst({
      select: cartSelect,
      where: { expiresAt: { gt: new Date() }, id: capability.cartId },
    });
    if (!cart) throw new UnauthorizedException(UNAUTHORIZED);
    return toCartDto(cart);
  }

  async createAndAdd(
    dto: AddCartItemDto,
    now = new Date(),
  ): Promise<CreatedCart> {
    const rawToken = generateCartToken();
    const expiresAt = new Date(now.getTime() + CART_LIFETIME_MS);
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      const product = await requireAvailableProduct(
        transaction,
        dto.productSlug,
        dto.quantity,
      );
      const created = await transaction.cart.create({
        data: {
          expiresAt,
          tokenDigest: toPrismaBytes(rawToken),
          items: {
            create: { productId: product.id, quantity: dto.quantity },
          },
        },
        select: { id: true },
      });
      return loadCart(transaction, created.id);
    });
    return { cart: toCartDto(cart), expiresAt, rawToken };
  }

  async add(
    capability: ActiveCartCapability,
    dto: AddCartItemDto,
    now = new Date(),
  ): Promise<CartDto> {
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      await lockActiveCart(transaction, capability.cartId, now);
      const product = await requireAvailableProduct(
        transaction,
        dto.productSlug,
        dto.quantity,
      );
      const existing = await transaction.cartItem.findUnique({
        select: { id: true, quantity: true },
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
        if (count >= MAX_DISTINCT_ITEMS) {
          throw new UnprocessableEntityException(UNAVAILABLE);
        }
        await transaction.cartItem.create({
          data: {
            cartId: capability.cartId,
            productId: product.id,
            quantity: dto.quantity,
          },
        });
      } else {
        const quantity = existing.quantity + dto.quantity;
        if (quantity > 99 || quantity > product.stockQuantity) {
          throw new UnprocessableEntityException(UNAVAILABLE);
        }
        await transaction.cartItem.update({
          data: { quantity },
          where: { id: existing.id },
        });
      }
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart);
  }

  async update(
    capability: ActiveCartCapability,
    productSlug: string,
    dto: UpdateCartItemDto,
    now = new Date(),
  ): Promise<CartDto> {
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      await lockActiveCart(transaction, capability.cartId, now);
      const item = await transaction.cartItem.findFirst({
        select: {
          id: true,
          product: {
            select: { currency: true, isActive: true, stockQuantity: true },
          },
        },
        where: { cartId: capability.cartId, product: { slug: productSlug } },
      });
      if (!item) throw new NotFoundException(NOT_FOUND);
      if (
        !item.product.isActive ||
        item.product.currency !== 'USD' ||
        item.product.stockQuantity < dto.quantity
      ) {
        throw new UnprocessableEntityException(UNAVAILABLE);
      }
      await transaction.cartItem.update({
        data: { quantity: dto.quantity },
        where: { id: item.id },
      });
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart);
  }

  async remove(
    capability: ActiveCartCapability,
    productSlug: string,
    now = new Date(),
  ): Promise<CartDto> {
    const cart = await runCartSerializable(this.prisma, async (transaction) => {
      await lockActiveCart(transaction, capability.cartId, now);
      const item = await transaction.cartItem.findFirst({
        select: { id: true },
        where: { cartId: capability.cartId, product: { slug: productSlug } },
      });
      if (!item) throw new NotFoundException(NOT_FOUND);
      await transaction.cartItem.delete({ where: { id: item.id } });
      return loadCart(transaction, capability.cartId);
    });
    return toCartDto(cart);
  }

  async clear(
    capability: ActiveCartCapability,
    now = new Date(),
  ): Promise<CartDto> {
    return runCartSerializable(this.prisma, async (transaction) => {
      await lockActiveCart(transaction, capability.cartId, now);
      await transaction.cartItem.deleteMany({
        where: { cartId: capability.cartId },
      });
      return this.empty();
    });
  }
}

async function requireAvailableProduct(
  transaction: Prisma.TransactionClient,
  slug: string,
  quantity: number,
) {
  const product = await transaction.product.findFirst({
    select: { id: true, stockQuantity: true },
    where: {
      currency: 'USD',
      isActive: true,
      slug,
      stockQuantity: { gte: quantity },
    },
  });
  if (!product) throw new UnprocessableEntityException(UNAVAILABLE);
  return product;
}

async function lockActiveCart(
  transaction: Prisma.TransactionClient,
  cartId: string,
  now: Date,
): Promise<void> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Cart"
    WHERE "id" = ${cartId}::uuid AND "expiresAt" > ${now}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new UnauthorizedException(UNAUTHORIZED);
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

function toCartDto(cart: StoredCart): CartDto {
  const items: CartItemDto[] = cart.items.map(({ product, quantity }) => {
    const isUsdActive = product.isActive && product.currency === 'USD';
    const available = isUsdActive && product.stockQuantity >= quantity;
    const currentUnitPriceMinor = isUsdActive ? product.priceMinor : null;
    return {
      availability: available ? 'available' : 'unavailable',
      currentUnitPriceMinor,
      imagePath: product.imagePath,
      lineTotalMinor:
        currentUnitPriceMinor === null
          ? null
          : currentUnitPriceMinor * quantity,
      name: product.name,
      priceQualifier: product.priceQualifier,
      productId: product.id,
      productSlug: product.slug,
      quantity,
    };
  });
  return {
    checkoutEligible:
      items.length > 0 &&
      items.every(({ availability }) => availability === 'available'),
    currency: 'USD',
    distinctItemCount: items.length,
    items,
    subtotalMinor: items.reduce(
      (total, { lineTotalMinor }) => total + (lineTotalMinor ?? 0),
      0,
    ),
    totalQuantity: items.reduce((total, { quantity }) => total + quantity, 0),
  };
}

function toPrismaBytes(rawToken: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hashCartToken(rawToken));
}
