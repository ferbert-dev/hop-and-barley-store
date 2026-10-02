import { UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { PrismaService } from '../database/prisma.service';
import { LikesService } from './likes.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('LikesService', () => {
  const aggregate = jest.fn();
  const findFirst = jest.fn();
  const upsert = jest.fn();
  let service: LikesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LikesService,
        {
          provide: PrismaService,
          useValue: {
            paymentAttempt: { findFirst },
            purchaseLike: { aggregate, upsert },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(LikesService);
    jest.clearAllMocks();
    aggregate.mockResolvedValue({ _sum: { count: 41 } });
    upsert.mockResolvedValue({ id: 'like-id' });
  });

  it('increments Likes for the exact paid account purchase after capture rotated its cart', async () => {
    findFirst.mockResolvedValue({
      checkoutDraft: {
        cartId: 'cart-id',
        guestCapabilityDigest: null,
        guestCapabilityExpiresAt: null,
        userId: 'user-id',
      },
      id: '11111111-1111-4111-8111-111111111111',
      order: { id: '22222222-2222-4222-8222-222222222222' },
    });

    await expect(
      service.create(
        '11111111-1111-4111-8111-111111111111',
        {
          cartId: 'new-account-cart-id',
          kind: 'account',
          rawToken: 'session',
          userId: 'user-id',
        },
        null,
      ),
    ).resolves.toEqual({ count: 41, liked: true });
    expect(findFirst).toHaveBeenCalledWith({
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
        id: '11111111-1111-4111-8111-111111111111',
        order: {
          is: {
            paymentMethod: 'STRIPE_DEBIT_CARD',
            paymentState: 'PAID',
            status: 'PAID',
          },
        },
        status: 'SUCCEEDED',
        userId: 'user-id',
      },
    });
    expect(upsert).toHaveBeenCalledWith({
      create: {
        orderId: '22222222-2222-4222-8222-222222222222',
        paymentAttemptId: '11111111-1111-4111-8111-111111111111',
      },
      update: { count: { increment: 1 } },
      where: { paymentAttemptId: '11111111-1111-4111-8111-111111111111' },
    });
  });

  it.each([
    [null, 'unknown'],
    [{ id: 'attempt', order: null }, 'unverified'],
  ])(
    'rejects %s attempts without creating a Like',
    async (eligible, _reason) => {
      void _reason;
      findFirst.mockResolvedValue(eligible);

      await expect(
        service.create(
          'attempt-id',
          {
            cartId: 'cart-id',
            kind: 'account',
            rawToken: 'session',
            userId: 'user-id',
          },
          null,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('retries the expected Prisma 7 PurchaseLike unique race once', async () => {
    findFirst.mockResolvedValue({
      checkoutDraft: {
        cartId: 'cart-id',
        guestCapabilityDigest: null,
        guestCapabilityExpiresAt: null,
        userId: 'user-id',
      },
      id: '11111111-1111-4111-8111-111111111111',
      order: { id: '22222222-2222-4222-8222-222222222222' },
    });
    upsert.mockRejectedValueOnce(
      new PrismaClientKnownRequestError('expected O3L race', {
        clientVersion: '7.10.0',
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'PurchaseLike_paymentAttemptId_key' },
              kind: 'UniqueConstraintViolation',
            },
          },
        },
      }),
    );

    await expect(
      service.create(
        '11111111-1111-4111-8111-111111111111',
        {
          cartId: 'new-account-cart-id',
          kind: 'account',
          rawToken: 'session',
          userId: 'user-id',
        },
        null,
      ),
    ).resolves.toEqual({ count: 41, liked: true });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('propagates an unrelated Prisma P2002 without retrying', async () => {
    findFirst.mockResolvedValue({
      checkoutDraft: {
        cartId: 'cart-id',
        guestCapabilityDigest: null,
        guestCapabilityExpiresAt: null,
        userId: 'user-id',
      },
      id: '11111111-1111-4111-8111-111111111111',
      order: { id: '22222222-2222-4222-8222-222222222222' },
    });
    const unrelated = new PrismaClientKnownRequestError(
      'unrelated unique conflict',
      {
        clientVersion: '7.10.0',
        code: 'P2002',
        meta: { target: 'Order_providerPaymentReference_key' },
      },
    );
    upsert.mockRejectedValueOnce(unrelated);

    await expect(
      service.create(
        '11111111-1111-4111-8111-111111111111',
        {
          cartId: 'new-account-cart-id',
          kind: 'account',
          rawToken: 'session',
          userId: 'user-id',
        },
        null,
      ),
    ).rejects.toBe(unrelated);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('returns only the summed aggregate count', async () => {
    await expect(service.count()).resolves.toEqual({ count: 41 });
    expect(aggregate).toHaveBeenCalledWith({ _sum: { count: true } });
  });

  it('returns zero when no purchase counter exists', async () => {
    aggregate.mockResolvedValue({ _sum: { count: null } });

    await expect(service.count()).resolves.toEqual({ count: 0 });
  });
});
