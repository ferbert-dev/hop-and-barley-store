import { RegistrationService } from './registration.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

describe('RegistrationService', () => {
  const passwordHash = {
    algorithm: 'argon2id',
    hashLength: 32,
    memoryCost: 7_168,
    parallelism: 1,
    passwordHash: '$argon2id$v=19$m=7168,p=1,t=5$salt$hash',
    saltLength: 16,
    timeCost: 5,
    version: 19,
  } as const;

  it('hashes before one nested atomic user/credential create', async () => {
    const calls: string[] = [];
    const prisma = {
      user: {
        create: jest.fn().mockImplementation(() => {
          calls.push('write');
          return Promise.resolve({ id: 'private' });
        }),
      },
    };
    const hasher = {
      hash: jest.fn().mockImplementation(() => {
        calls.push('hash');
        return Promise.resolve(passwordHash);
      }),
    };
    const service = new RegistrationService(prisma as never, hasher as never);

    await expect(
      service.register(
        {
          email: 'Brew.Master@Example.com',
          password: 'correct horse battery staple',
        },
        'request-1',
      ),
    ).resolves.toEqual({ status: 'accepted' });

    expect(calls).toEqual(['hash', 'write']);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'Brew.Master@Example.com',
        normalizedEmail: 'brew.master@example.com',
        passwordCredential: { create: passwordHash },
      },
      select: { id: true },
    });
  });

  it('hashes duplicates and returns the byte-identical accepted shape', async () => {
    const prisma = {
      user: {
        create: jest.fn().mockRejectedValue({
          code: 'P2002',
          meta: { target: 'User_normalizedEmail_key' },
        }),
      },
    };
    const hasher = { hash: jest.fn().mockResolvedValue(passwordHash) };
    const service = new RegistrationService(prisma as never, hasher as never);

    const result = await service.register(
      { email: 'BREW@example.com', password: 'correct horse battery staple' },
      'request-2',
    );

    expect(hasher.hash).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).toBe(JSON.stringify({ status: 'accepted' }));
  });

  it('recognizes the Prisma 7 adapter-pg named unique constraint shape', async () => {
    const prisma = {
      user: {
        create: jest.fn().mockRejectedValue({
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
      },
    };
    const hasher = { hash: jest.fn().mockResolvedValue(passwordHash) };
    const service = new RegistrationService(prisma as never, hasher as never);

    await expect(
      service.register(
        { email: 'BREW@example.com', password: 'correct horse battery staple' },
        'request-prisma-7',
      ),
    ).resolves.toEqual({ status: 'accepted' });
  });

  it('recognizes the quoted Prisma 7 adapter-pg field shape', async () => {
    const prisma = {
      user: {
        create: jest.fn().mockRejectedValue({
          code: 'P2002',
          meta: {
            driverAdapterError: {
              cause: {
                constraint: { fields: ['"normalizedEmail"'] },
                kind: 'UniqueConstraintViolation',
              },
            },
          },
        }),
      },
    };
    const hasher = { hash: jest.fn().mockResolvedValue(passwordHash) };
    const service = new RegistrationService(prisma as never, hasher as never);

    await expect(
      service.register(
        { email: 'BREW@example.com', password: 'correct horse battery staple' },
        'request-prisma-7-fields',
      ),
    ).resolves.toEqual({ status: 'accepted' });
  });

  it('maps no other persistence failure to duplicate acceptance', async () => {
    const prisma = {
      user: {
        create: jest.fn().mockRejectedValue({
          code: 'P2002',
          meta: { target: 'PasswordCredential_userId_key' },
        }),
      },
    };
    const hasher = { hash: jest.fn().mockResolvedValue(passwordHash) };
    const service = new RegistrationService(prisma as never, hasher as never);

    await expect(
      service.register(
        { email: 'brew@example.com', password: 'correct horse battery staple' },
        'request-3',
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
