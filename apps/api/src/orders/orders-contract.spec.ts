import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { API_CORS_ALLOWED_HEADERS } from '../app-cors';
import { createAppValidationPipe } from '../app-validation';
import type { PrismaService } from '../database/prisma.service';
import { CheckoutPaymentMethod, CreateOrderDto } from './dto/create-order.dto';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { assertOrderStatusTransition } from './order-status';
import { runOrderSerializable } from './order-transaction';
import { OrdersService } from './orders.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const checkout = {
  city: 'Portland',
  fullName: 'Ada Brewer',
  items: [{ productSlug: 'cascade-hops', amount: 2 }],
  paymentMethod: CheckoutPaymentMethod.CASH_ON_DELIVERY,
  phoneNumber: '+1 555 0100',
  shippingAddress: '10 Brewery Lane',
};

describe('O2 order contract', () => {
  it('accepts the approved checkout fields and rejects client-owned totals', async () => {
    const pipe = createAppValidationPipe();
    await expect(
      pipe.transform(checkout, {
        data: '',
        metatype: CreateOrderDto,
        type: 'body',
      }),
    ).resolves.toMatchObject(checkout);
    await expect(
      pipe.transform(
        { ...checkout, totalMinor: 1 },
        { data: '', metatype: CreateOrderDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate line identifiers and unavailable payment methods', async () => {
    const pipe = createAppValidationPipe();
    await expect(
      pipe.transform(
        { ...checkout, items: [...checkout.items, ...checkout.items] },
        { data: '', metatype: CreateOrderDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const service = new OrdersService({} as PrismaService);
    await expect(
      service.create(
        {
          cartId: '30000000-0000-4000-8000-000000000001',
          idempotencyKey: 'order-key-001',
          userId: '10000000-0000-4000-8000-000000000001',
        },
        {
          ...checkout,
          paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
        },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(service).not.toHaveProperty('finalizeVerifiedStripePayment');
  });

  it('requires a bounded replay-safe idempotency key', () => {
    const pipe = new IdempotencyKeyPipe();
    expect(pipe.transform('checkout-2026-0001')).toBe('checkout-2026-0001');
    for (const value of [
      undefined,
      'short',
      'bad key',
      `a${'b'.repeat(128)}`,
    ]) {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    }
  });

  it('allows the required idempotency header through browser CORS', () => {
    expect(
      API_CORS_ALLOWED_HEADERS.map((header) => header.toLowerCase()),
    ).toContain('idempotency-key');
  });

  it('allows only forward order-status transitions', () => {
    expect(() =>
      assertOrderStatusTransition('PLACED', 'SHIPPED'),
    ).not.toThrow();
    expect(() => assertOrderStatusTransition('PAID', 'SHIPPED')).not.toThrow();
    expect(() =>
      assertOrderStatusTransition('SHIPPED', 'DELIVERED'),
    ).not.toThrow();
    expect(() => assertOrderStatusTransition('DELIVERED', 'PAID')).toThrow(
      ConflictException,
    );
    expect(() => assertOrderStatusTransition('CANCELLED', 'SHIPPED')).toThrow(
      ConflictException,
    );
  });

  it('retries PostgreSQL adapter serialization conflicts', async () => {
    const operation = jest.fn().mockResolvedValue('ok');
    const host = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({
          code: 'P2010',
          meta: {
            driverAdapterError: {
              cause: { originalCode: '40001' },
            },
          },
        })
        .mockImplementationOnce(operation),
    };

    await expect(
      runOrderSerializable(host, () => Promise.resolve('ignored')),
    ).resolves.toBe('ok');
    expect(host.$transaction).toHaveBeenCalledTimes(2);
  });
});
