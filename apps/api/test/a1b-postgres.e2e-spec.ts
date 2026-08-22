import { Client } from 'pg';
import { PrismaService } from '../src/database/prisma.service';
import { SessionService } from '../src/auth/session/session.service';

const describePostgres = process.env.RUN_A1B_POSTGRES_INTEGRATION
  ? describe
  : describe.skip;

const NOW_TOLERANCE_MS = 5_000;
const HASH_PREFIX = '$argon2id$v=19$m=7168,p=1,t=5$';

describePostgres('A1B sessions with disposable PostgreSQL', () => {
  let postgres: Client;
  let prisma: PrismaService;
  let sessions: SessionService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    prisma = new PrismaService();
    sessions = new SessionService(prisma);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('deploys named constraints, indexes and the hash-only relation', async () => {
    const constraints = await postgres.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'AuthSession_pkey',
        'AuthSession_tokenHash_length_check',
        'AuthSession_absolute_lifetime_check',
        'AuthSession_activity_window_check',
        'AuthSession_revokedAt_check',
        'AuthSession_userId_fkey'
      )
      ORDER BY conname
    `);
    const indexes = await postgres.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'AuthSession'
        AND indexname IN (
          'AuthSession_tokenHash_key',
          'AuthSession_userId_active_idx',
          'AuthSession_expiresAt_idx'
        )
      ORDER BY indexname
    `);

    expect(constraints.rows.map(({ conname }) => conname)).toHaveLength(6);
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      'AuthSession_expiresAt_idx',
      'AuthSession_tokenHash_key',
      'AuthSession_userId_active_idx',
    ]);
  });

  it('stores only a 32-byte SHA-256 token hash with absolute and idle state', async () => {
    const userId = await createUser('hash-only@example.com');
    const issued = await sessions.issue(userId, null);
    const row = await postgres.query<{
      expiresAt: Date;
      hashBytes: number;
      hashHex: string;
      issuedAt: Date;
      lastSeenAt: Date;
    }>(
      `
      SELECT
        octet_length("tokenHash")::int AS "hashBytes",
        encode("tokenHash", 'hex') AS "hashHex",
        "issuedAt",
        "lastSeenAt",
        "expiresAt"
      FROM "AuthSession"
      WHERE "userId" = $1::uuid
    `,
      [userId],
    );

    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].hashBytes).toBe(32);
    expect(row.rows[0].hashHex).not.toContain(issued.rawToken);
    expect(row.rows[0].lastSeenAt.getTime()).toBe(
      row.rows[0].issuedAt.getTime(),
    );
    expect(
      row.rows[0].expiresAt.getTime() - row.rows[0].issuedAt.getTime(),
    ).toBe(7 * 24 * 60 * 60 * 1_000);
  });

  it('keeps at most five active sessions under concurrent issuance', async () => {
    const userId = await createUser('max-five@example.com');

    const issued = await Promise.all(
      Array.from({ length: 6 }, () => sessions.issue(userId, null)),
    );
    const active = await activeRows(userId);

    expect(active).toHaveLength(5);
    const accepted = await Promise.all(
      issued.map(({ rawToken }) => sessions.authenticate(rawToken)),
    );
    expect(accepted.filter(Boolean)).toHaveLength(5);
  });

  it('atomically rotates the presented same-user token', async () => {
    const userId = await createUser('rotate@example.com');
    const first = await sessions.issue(userId, null);
    const rotated = await sessions.issue(userId, first.rawToken);

    await expect(sessions.authenticate(first.rawToken)).resolves.toBeNull();
    await expect(
      sessions.authenticate(rotated.rawToken),
    ).resolves.toMatchObject({
      userId,
    });
    expect(await activeRows(userId)).toHaveLength(1);
  });

  it('serializes concurrent rotation and revoke-all without partial rows', async () => {
    const userId = await createUser('revoke-race@example.com');
    const first = await sessions.issue(userId, null);
    const [rotation, revoked] = await Promise.all([
      sessions.issue(userId, first.rawToken),
      sessions.revokeAll(userId),
    ]);
    const active = await activeRows(userId);

    expect(revoked).toBeGreaterThanOrEqual(1);
    expect(active.length).toBeLessThanOrEqual(1);
    const current = await sessions.authenticate(rotation.rawToken);
    expect(Boolean(current)).toBe(active.length === 1);
  });

  it('coalesces concurrent touches and never resurrects revoked or expired rows', async () => {
    const userId = await createUser('touch@example.com');
    const issued = await sessions.issue(
      userId,
      null,
      new Date(Date.now() - 60 * 60 * 1_000),
    );
    await prisma.authSession.updateMany({
      data: { lastSeenAt: new Date(Date.now() - 20 * 60 * 1_000) },
      where: { userId },
    });

    const touched = await Promise.all([
      sessions.authenticate(issued.rawToken),
      sessions.authenticate(issued.rawToken),
    ]);
    expect(touched.every(Boolean)).toBe(true);
    const afterTouch = await prisma.authSession.findFirstOrThrow({
      where: { userId },
    });
    expect(Math.abs(Date.now() - afterTouch.lastSeenAt.getTime())).toBeLessThan(
      NOW_TOLERANCE_MS,
    );

    await prisma.authSession.updateMany({
      data: { revokedAt: new Date() },
      where: { userId },
    });
    await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
  });

  it('fails closed for disabled, role-changed, password-changed and deleted users', async () => {
    const userId = await createUser('current-state@example.com');
    const issued = await sessions.issue(userId, null);

    await prisma.user.update({
      data: { status: 'DISABLED' },
      where: { id: userId },
    });
    await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
    await prisma.user.update({
      data: { role: 'ADMIN', status: 'ACTIVE' },
      where: { id: userId },
    });
    await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
    await prisma.user.update({
      data: { role: 'CUSTOMER' },
      where: { id: userId },
    });
    await prisma.passwordCredential.update({
      data: { changedAt: new Date(Date.now() + 1_000) },
      where: { userId },
    });
    await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
    await prisma.user.delete({ where: { id: userId } });
    await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
  });

  it('rolls rotation back when the new session insert fails', async () => {
    const userId = await createUser('atomicity@example.com');
    const issued = await sessions.issue(userId, null);
    await postgres.query(`
      CREATE FUNCTION a1b_reject_session_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'a1b injected insert failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "a1b_reject_session_insert"
      BEFORE INSERT ON "AuthSession"
      FOR EACH ROW EXECUTE FUNCTION a1b_reject_session_insert();
    `);

    try {
      await expect(
        sessions.issue(userId, issued.rawToken),
      ).rejects.toBeDefined();
    } finally {
      await postgres.query(`
        DROP TRIGGER IF EXISTS "a1b_reject_session_insert" ON "AuthSession";
        DROP FUNCTION IF EXISTS a1b_reject_session_insert();
      `);
    }

    await expect(sessions.authenticate(issued.rawToken)).resolves.toMatchObject(
      {
        userId,
      },
    );
    expect(await activeRows(userId)).toHaveLength(1);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await postgres?.end();
  });

  async function createUser(email: string): Promise<string> {
    const created = await prisma.user.create({
      data: {
        email,
        normalizedEmail: email,
        passwordCredential: {
          create: credential('A'.repeat(43)),
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  async function activeRows(userId: string) {
    return prisma.authSession.findMany({
      where: {
        expiresAt: { gt: new Date() },
        lastSeenAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
        revokedAt: null,
        userId,
      },
    });
  }
});

function credential(hashBody: string) {
  return {
    algorithm: 'argon2id',
    hashLength: 32,
    memoryCost: 7_168,
    parallelism: 1,
    passwordHash: `${HASH_PREFIX}${'c2FsdHNhbHRzYWx0MTIzNA'}$${hashBody}`,
    saltLength: 16,
    timeCost: 5,
    version: 19,
  } as const;
}
