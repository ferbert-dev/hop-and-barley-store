import { randomBytes } from 'node:crypto';
import {
  LOCAL_ADMIN_EMAIL,
  LocalAdminProvisioningError,
  LocalAdminProvisioningService,
} from './local-admin-provisioning.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

const STRONG_PASSWORD = createStrongTestPassword();
const PASSWORD_HASH = '$argon2id$v=19$m=7168,p=1,t=5$salt$hash';
const USER_ID = '10000000-0000-4000-8000-000000000001';

describe('LocalAdminProvisioningService', () => {
  it('creates exactly the deterministic active administrator identity', async () => {
    const fixture = createFixture(null);

    await expect(
      fixture.service.provision(STRONG_PASSWORD, {
        promoteExistingCustomer: false,
      }),
    ).resolves.toEqual({ outcome: 'created' });

    expect(fixture.hasher.hash).toHaveBeenCalledWith(STRONG_PASSWORD);
    expect(fixture.prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: LOCAL_ADMIN_EMAIL,
        normalizedEmail: LOCAL_ADMIN_EMAIL,
        passwordCredential: { create: fixture.credential },
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('is a no-op when the active administrator already has the supplied password', async () => {
    const fixture = createFixture(existingUser('ADMIN'));

    await expect(
      fixture.service.provision(STRONG_PASSWORD, {
        promoteExistingCustomer: false,
      }),
    ).resolves.toEqual({ outcome: 'unchanged' });

    expect(fixture.hasher.verify).toHaveBeenCalledWith(
      PASSWORD_HASH,
      STRONG_PASSWORD,
    );
    expect(fixture.hasher.hash).not.toHaveBeenCalled();
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an existing customer without explicit promotion intent', async () => {
    const fixture = createFixture(existingUser('CUSTOMER'));

    await expect(
      fixture.service.provision(STRONG_PASSWORD, {
        promoteExistingCustomer: false,
      }),
    ).rejects.toBeInstanceOf(LocalAdminProvisioningError);
    expect(fixture.hasher.verify).not.toHaveBeenCalled();
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('promotes only with explicit intent and transactionally revokes sessions', async () => {
    const existing = existingUser('CUSTOMER');
    const fixture = createFixture(existing);
    fixture.transaction.user.findUnique.mockResolvedValue(existing);

    await expect(
      fixture.service.provision(STRONG_PASSWORD, {
        promoteExistingCustomer: true,
      }),
    ).resolves.toEqual({ outcome: 'promoted' });

    expect(fixture.transaction.user.update).toHaveBeenCalledWith({
      data: { email: LOCAL_ADMIN_EMAIL, role: 'ADMIN' },
      select: { id: true },
      where: { id: USER_ID },
    });
    const revocation =
      fixture.transaction.authSession.updateMany.mock.calls[0]?.[0];
    expect(revocation?.data.revokedAt).toBeInstanceOf(Date);
    expect(revocation?.where).toEqual({ revokedAt: null, userId: USER_ID });
    expect(fixture.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'Serializable', maxWait: 2_000, timeout: 5_000 },
    );
  });

  it.each([
    existingUser('ADMIN', 'DISABLED'),
    { ...existingUser('ADMIN'), passwordCredential: null },
  ])(
    'rejects an unsafe existing identity without changing it %#',
    async (user) => {
      const fixture = createFixture(user);

      await expect(
        fixture.service.provision(STRONG_PASSWORD, {
          promoteExistingCustomer: true,
        }),
      ).rejects.toBeInstanceOf(LocalAdminProvisioningError);
      expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects password mismatch without rotating credentials or leaking input', async () => {
    const fixture = createFixture(existingUser('ADMIN'));
    fixture.hasher.verify.mockResolvedValue(false);

    const failure = fixture.service.provision(STRONG_PASSWORD, {
      promoteExistingCustomer: false,
    });
    await expect(failure).rejects.toBeInstanceOf(LocalAdminProvisioningError);
    await expect(failure).rejects.not.toThrow(STRONG_PASSWORD);
    expect(fixture.hasher.hash).not.toHaveBeenCalled();
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });
});

function createFixture(
  user: Readonly<{
    id: string;
    passwordCredential: Readonly<{ passwordHash: string }> | null;
    role: 'ADMIN' | 'CUSTOMER';
    status: 'ACTIVE' | 'DISABLED';
  }> | null,
) {
  const credential = {
    algorithm: 'argon2id' as const,
    hashLength: 32,
    memoryCost: 7_168,
    parallelism: 1,
    passwordHash: PASSWORD_HASH,
    saltLength: 16,
    timeCost: 5,
    version: 19,
  };
  type RevocationArgs = Readonly<{
    data: Readonly<{ revokedAt: Date }>;
    where: Readonly<{ revokedAt: null; userId: string }>;
  }>;
  const transaction = {
    authSession: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [RevocationArgs]>()
        .mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: USER_ID }),
    },
  };
  type TransactionOperation = (
    transactionClient: typeof transaction,
  ) => Promise<unknown>;
  const prisma = {
    $transaction: jest
      .fn<Promise<unknown>, [TransactionOperation, options?: unknown]>()
      .mockImplementation((operation) => operation(transaction)),
    user: {
      create: jest.fn().mockResolvedValue({ id: USER_ID }),
      findUnique: jest.fn().mockResolvedValue(user),
    },
  };
  const hasher = {
    hash: jest.fn().mockResolvedValue(credential),
    verify: jest.fn().mockResolvedValue(true),
  };
  return {
    credential,
    hasher,
    prisma,
    service: new LocalAdminProvisioningService(
      prisma as never,
      hasher as never,
    ),
    transaction,
  };
}

function existingUser(
  role: 'ADMIN' | 'CUSTOMER',
  status: 'ACTIVE' | 'DISABLED' = 'ACTIVE',
) {
  return {
    id: USER_ID,
    passwordCredential: { passwordHash: PASSWORD_HASH },
    role,
    status,
  } as const;
}

function createStrongTestPassword(): string {
  return `Aa1!${randomBytes(18).toString('base64url')}`;
}
