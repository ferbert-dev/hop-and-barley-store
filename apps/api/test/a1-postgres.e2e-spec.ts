import { Client } from 'pg';
import { PrismaService } from '../src/database/prisma.service';
import { RegistrationService } from '../src/auth/registration.service';

const describePostgres = process.env.RUN_A1_POSTGRES_INTEGRATION
  ? describe
  : describe.skip;

const HASH_PREFIX = '$argon2id$v=19$m=65536,p=1,t=3$';

describePostgres('A1 secure registration with PostgreSQL', () => {
  let postgres: Client;
  let prisma: PrismaService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    prisma = new PrismaService();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('deploys the named uniqueness, profile, and one-to-one constraints', async () => {
    const result = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'User_pkey',
        'User_email_length_check',
        'User_normalizedEmail_canonical_check',
        'PasswordCredential_pkey',
        'PasswordCredential_algorithm_check',
        'PasswordCredential_hash_format_check',
        'PasswordCredential_userId_fkey'
      )
      ORDER BY conname
    `);
    const uniqueIndex = await postgres.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'User'
        AND indexname = 'User_normalizedEmail_key'
    `);

    expect(result.rows.map(({ conname }) => conname)).toHaveLength(7);
    expect(uniqueIndex.rows).toEqual([
      { indexname: 'User_normalizedEmail_key' },
    ]);
  });

  it('allows exactly one concurrent winner while both attempts hash and accept', async () => {
    let hashCalls = 0;
    const hasher = {
      hash: jest.fn().mockImplementation(() => {
        hashCalls += 1;
        return Promise.resolve(credential(`${hashCalls}`.padStart(43, 'A')));
      }),
    };
    const service = new RegistrationService(prisma, hasher as never);

    const results = await Promise.all([
      service.register(
        {
          email: 'Brew.Master@BÜCHER.example',
          password: 'correct horse battery staple',
        },
        'a1-postgres-race-1',
      ),
      service.register(
        {
          email: 'BREW.MASTER@xn--bcher-kva.example',
          password: 'another correct horse battery staple',
        },
        'a1-postgres-race-2',
      ),
    ]);

    expect(results).toEqual([{ status: 'accepted' }, { status: 'accepted' }]);
    expect(hasher.hash).toHaveBeenCalledTimes(2);
    await expect(prisma.user.count()).resolves.toBe(1);
    await expect(prisma.passwordCredential.count()).resolves.toBe(1);
  });

  it('rolls back the parent user when its nested credential violates the profile', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'atomic@example.com',
          normalizedEmail: 'atomic@example.com',
          passwordCredential: {
            create: { ...credential('B'.repeat(43)), memoryCost: 65_535 },
          },
        },
      }),
    ).rejects.toBeDefined();

    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.passwordCredential.count()).resolves.toBe(0);
  });

  it('rejects non-canonical normalized email at the database boundary', async () => {
    await expect(
      prisma.user.create({
        data: {
          email: 'Brew@Example.com',
          normalizedEmail: 'Brew@Example.com',
        },
      }),
    ).rejects.toBeDefined();
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.end();
  });
});

function credential(hashBody: string) {
  return {
    algorithm: 'argon2id',
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 1,
    passwordHash: `${HASH_PREFIX}${'c2FsdHNhbHRzYWx0MTIzNA'}$${hashBody}`,
    saltLength: 16,
    timeCost: 3,
    version: 19,
  } as const;
}
