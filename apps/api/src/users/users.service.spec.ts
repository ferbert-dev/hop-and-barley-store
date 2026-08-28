import { UsersService } from './users.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

const USER_ID = '10000000-0000-4000-8000-000000000001';

describe('UsersService self-profile', () => {
  it('returns only the safe profile projection and never avatar bytes', async () => {
    const stored = currentUser();
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(stored) },
    };
    const service = new UsersService(prisma as never);

    const result = await service.getCurrent(USER_ID);

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    );
    expect(result).toEqual({
      email: 'brewer@example.com',
      primaryAddress: {
        additionalInfo: null,
        apartmentUnit: '2B',
        city: 'Madrid',
        country: 'Spain',
        floor: null,
        houseNumber: '7',
        postalCode: '28001',
        street: 'Calle Malta',
      },
      profile: {
        avatar: {
          contentType: 'image/png',
          sizeBytes: 8,
          updatedAt: '2026-08-28T12:00:00.000Z',
        },
        fullName: 'Brew Master',
        phone: '  +49 123  ',
      },
      role: 'CUSTOMER',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /avatarData|password|credential|session|status|userId/i,
    );
  });

  it('uses only the supplied session user id and writes user/profile/address in one transaction', async () => {
    const transaction = transactionClient();
    const prisma = {
      $transaction: jest.fn(
        async (operation: (client: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const service = new UsersService(prisma as never);

    await service.updateCurrent(USER_ID, {
      email: 'Brew.Master@Example.com',
      primaryAddress: { city: 'Madrid' },
      profile: { fullName: 'Brew Master', phone: '  +49 123  ' },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      select: { id: true, status: true },
      where: { id: USER_ID },
    });
    expect(transaction.user.update).toHaveBeenCalledWith({
      data: {
        email: 'Brew.Master@Example.com',
        normalizedEmail: 'brew.master@example.com',
      },
      select: { id: true },
      where: { id: USER_ID },
    });
    expect(transaction.customerProfile.upsert).toHaveBeenCalledWith({
      create: {
        fullName: 'Brew Master',
        phone: '  +49 123  ',
        userId: USER_ID,
      },
      update: { fullName: 'Brew Master', phone: '  +49 123  ' },
      where: { userId: USER_ID },
    });
    expect(transaction.primaryAddress.upsert).toHaveBeenCalledWith({
      create: { city: 'Madrid', userId: USER_ID },
      update: { city: 'Madrid' },
      where: { userId: USER_ID },
    });
  });

  it('maps the normalized-email uniqueness race to the generic invalid-profile response', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue({
        code: 'P2002',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { index: 'User_normalizedEmail_key' },
              kind: 'UniqueConstraintViolation',
            },
          },
        },
      }),
    };
    const service = new UsersService(prisma as never);

    await expect(
      service.updateCurrent(USER_ID, { email: 'taken@example.com' }),
    ).rejects.toMatchObject({
      response: {
        message: 'Review your account information and try again.',
        status: 'invalid-profile',
      },
      status: 400,
    });
  });

  it('stores, reads and deletes avatar bytes only under the session user id', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const now = new Date('2026-08-28T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    const customerProfile = {
      findUnique: jest.fn().mockResolvedValue({
        avatarContentType: 'image/png',
        avatarData: Uint8Array.from(bytes),
        avatarSizeBytes: bytes.length,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({
        avatarContentType: 'image/png',
        avatarSizeBytes: bytes.length,
        avatarUpdatedAt: now,
      }),
    };
    const service = new UsersService({ customerProfile } as never);

    await expect(
      service.saveAvatar(USER_ID, {
        buffer: bytes,
        mimetype: 'image/png',
        size: bytes.length,
      }),
    ).resolves.toEqual({
      contentType: 'image/png',
      sizeBytes: bytes.length,
      updatedAt: now.toISOString(),
    });
    expect(customerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    await expect(service.readAvatar(USER_ID)).resolves.toMatchObject({
      contentType: 'image/png',
      sizeBytes: bytes.length,
    });
    await service.deleteAvatar(USER_ID);
    expect(customerProfile.updateMany).toHaveBeenCalledWith({
      data: {
        avatarContentType: null,
        avatarData: null,
        avatarSizeBytes: null,
        avatarUpdatedAt: null,
      },
      where: { userId: USER_ID },
    });
    jest.useRealTimers();
  });
});

function currentUser() {
  return {
    customerProfile: {
      avatarContentType: 'image/png',
      avatarSizeBytes: 8,
      avatarUpdatedAt: new Date('2026-08-28T12:00:00.000Z'),
      fullName: 'Brew Master',
      phone: '  +49 123  ',
    },
    email: 'brewer@example.com',
    primaryAddress: {
      additionalInfo: null,
      apartmentUnit: '2B',
      city: 'Madrid',
      country: 'Spain',
      floor: null,
      houseNumber: '7',
      postalCode: '28001',
      street: 'Calle Malta',
    },
    role: 'CUSTOMER',
    status: 'ACTIVE',
  } as const;
}

function transactionClient() {
  return {
    customerProfile: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    primaryAddress: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, status: 'ACTIVE' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(currentUser()),
      update: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
  };
}
