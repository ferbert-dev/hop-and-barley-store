import { Client } from 'pg';
import { PrismaService } from '../src/database/prisma.service';
import { UsersService } from '../src/users/users.service';

const describePostgres = process.env.RUN_A4_POSTGRES_INTEGRATION
  ? describe
  : describe.skip;

describePostgres('A4 profiles with disposable PostgreSQL', () => {
  let postgres: Client;
  let prisma: PrismaService;
  let users: UsersService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    prisma = new PrismaService();
    users = new UsersService(prisma);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.end();
  });

  it('deploys optional owner-keyed tables and the bounded avatar constraint', async () => {
    const constraints = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'CustomerProfile_pkey',
        'CustomerProfile_avatar_check',
        'CustomerProfile_userId_fkey',
        'PrimaryAddress_pkey',
        'PrimaryAddress_userId_fkey'
      )
      ORDER BY conname
    `);
    expect(constraints.rows.map(({ conname }) => conname)).toEqual([
      'CustomerProfile_avatar_check',
      'CustomerProfile_pkey',
      'CustomerProfile_userId_fkey',
      'PrimaryAddress_pkey',
      'PrimaryAddress_userId_fkey',
    ]);

    const nullableAddressFields = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'PrimaryAddress'
        AND column_name IN (
          'country', 'city', 'postalCode', 'street', 'houseNumber',
          'apartmentUnit', 'floor', 'additionalInfo'
        )
        AND is_nullable = 'YES'
    `);
    expect(nullableAddressFields.rows[0].count).toBe('8');
  });

  it('persists exact phone text and isolates each self-owned profile', async () => {
    const firstId = await createUser('first@example.com');
    const secondId = await createUser('second@example.com');

    await users.updateCurrent(firstId, {
      primaryAddress: { city: 'Madrid', houseNumber: '7' },
      profile: { fullName: 'First Brewer', phone: '  +49 123  ' },
    });

    await expect(users.getCurrent(firstId)).resolves.toMatchObject({
      email: 'first@example.com',
      primaryAddress: { city: 'Madrid', houseNumber: '7' },
      profile: { fullName: 'First Brewer', phone: '  +49 123  ' },
    });
    await expect(users.getCurrent(secondId)).resolves.toMatchObject({
      email: 'second@example.com',
      primaryAddress: null,
      profile: null,
    });
  });

  it('maps a normalized-email race without partially changing either user', async () => {
    const firstId = await createUser('first@example.com');
    await createUser('taken@example.com');

    await expect(
      users.updateCurrent(firstId, {
        email: 'TAKEN@example.com',
        profile: { fullName: 'Must roll back' },
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(users.getCurrent(firstId)).resolves.toMatchObject({
      email: 'first@example.com',
      profile: null,
    });
  });

  it('rolls back email and profile when address persistence fails mid-transaction', async () => {
    const userId = await createUser('atomic@example.com');
    await postgres.query(`
      CREATE FUNCTION a4_reject_address_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'a4 injected address failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "a4_reject_address_insert"
      BEFORE INSERT ON "PrimaryAddress"
      FOR EACH ROW EXECUTE FUNCTION a4_reject_address_insert();
    `);

    try {
      await expect(
        users.updateCurrent(userId, {
          email: 'changed@example.com',
          primaryAddress: { city: 'Madrid' },
          profile: { fullName: 'Must roll back' },
        }),
      ).rejects.toBeDefined();
    } finally {
      await postgres.query(`
        DROP TRIGGER IF EXISTS "a4_reject_address_insert" ON "PrimaryAddress";
        DROP FUNCTION IF EXISTS a4_reject_address_insert();
      `);
    }

    await expect(users.getCurrent(userId)).resolves.toMatchObject({
      email: 'atomic@example.com',
      primaryAddress: null,
      profile: null,
    });
  });

  it('stores bounded avatar bytes with coherent metadata and deletes them', async () => {
    const userId = await createUser('avatar@example.com');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await users.saveAvatar(userId, {
      buffer: png,
      mimetype: 'image/png',
      size: png.length,
    });

    const stored = await postgres.query<{
      bytes: number;
      contentType: string;
      sizeBytes: number;
    }>(
      `SELECT octet_length("avatarData")::int AS bytes,
              "avatarContentType" AS "contentType",
              "avatarSizeBytes" AS "sizeBytes"
       FROM "CustomerProfile" WHERE "userId" = $1::uuid`,
      [userId],
    );
    expect(stored.rows[0]).toEqual({
      bytes: png.length,
      contentType: 'image/png',
      sizeBytes: png.length,
    });
    await expect(users.readAvatar(userId)).resolves.toMatchObject({
      contentType: 'image/png',
      sizeBytes: png.length,
    });

    await expect(
      postgres.query(
        `UPDATE "CustomerProfile"
         SET "avatarData" = $2::bytea, "avatarSizeBytes" = 2097153
         WHERE "userId" = $1::uuid`,
        [userId, Buffer.alloc(2 * 1024 * 1024 + 1)],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await users.deleteAvatar(userId);
    await expect(users.readAvatar(userId)).rejects.toMatchObject({
      status: 404,
    });
  });

  async function createUser(email: string): Promise<string> {
    const created = await prisma.user.create({
      data: { email, normalizedEmail: email.toLowerCase() },
      select: { id: true },
    });
    return created.id;
  }
});
