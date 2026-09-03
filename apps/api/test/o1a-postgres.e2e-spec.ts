import { Client } from 'pg';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/database/prisma.service';

const describePostgres =
  process.env.RUN_O1A_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-09-03T17:40:00.000Z');
const userIds = [
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
] as const;

describePostgres('O1A account-cart merge with disposable PostgreSQL', () => {
  let carts: CartService;
  let postgres: Client;
  let prisma: PrismaService;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();
    prisma = new PrismaService();
    carts = new CartService(prisma);
    for (const [index, id] of userIds.entries()) {
      await prisma.user.upsert({
        create: {
          email: `o1a-${String(index)}@example.test`,
          id,
          normalizedEmail: `o1a-${String(index)}@example.test`,
        },
        update: { status: 'ACTIVE' },
        where: { id },
      });
    }
  });

  beforeEach(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.updateMany({
      data: { stockAmount: 0 },
      where: { slug: { in: ['citra-hops', 'cascade-hops'] } },
    });
  });

  afterAll(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.user.deleteMany({ where: { id: { in: [...userIds] } } });
    await prisma.$disconnect();
    await postgres.end();
  });

  it('deploys nullable unique account ownership with its foreign key', async () => {
    const result = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_constraint
      WHERE conname = 'Cart_userId_fkey'
    `);
    expect(result.rows[0]?.count).toBe('1');
    const indexes = await postgres.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM pg_indexes
      WHERE indexname = 'Cart_userId_key'
    `);
    expect(indexes.rows[0]?.count).toBe('1');
  });

  it('merges union and max without stock or reservation mutation', async () => {
    await carts.mergeGuestIntoAccount(userIds[0], null, now);
    const account = await requireAccount(userIds[0], 'session-account');
    await carts.add(
      account,
      { amount: 500_000, productSlug: 'citra-hops' },
      now,
    );
    await carts.add(
      account,
      { amount: 100_000, productSlug: 'cascade-hops' },
      now,
    );

    const guest = await carts.createAndAdd(
      { amount: 200_000, productSlug: 'citra-hops' },
      now,
    );
    const guestAccess = await carts.authenticate(guest.rawToken, now);
    if (!guestAccess) throw new Error('Expected guest cart');
    await carts.add(
      guestAccess,
      { amount: 300_000, productSlug: 'cascade-hops' },
      now,
    );

    await expect(
      carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
    ).resolves.toBe('succeeded');
    await expect(carts.authenticate(guest.rawToken, now)).resolves.toBeNull();
    const merged = await carts.getCart(
      await requireAccount(userIds[0], 'session-after-merge'),
      now,
    );
    expect(merged.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: 500_000, productSlug: 'citra-hops' }),
        expect.objectContaining({
          amount: 300_000,
          productSlug: 'cascade-hops',
        }),
      ]),
    );
    expect(await prisma.cartReservation.count()).toBe(0);
    expect(
      await prisma.product.findMany({
        orderBy: { slug: 'asc' },
        select: { slug: true, stockAmount: true },
        where: { slug: { in: ['citra-hops', 'cascade-hops'] } },
      }),
    ).toEqual([
      { slug: 'cascade-hops', stockAmount: 0 },
      { slug: 'citra-hops', stockAmount: 0 },
    ]);
  });

  it('is idempotent under concurrent retry and never sums overlap', async () => {
    await carts.mergeGuestIntoAccount(userIds[0], null, now);
    const account = await requireAccount(userIds[0], 'session-account');
    await carts.add(
      account,
      { amount: 400_000, productSlug: 'citra-hops' },
      now,
    );
    const guest = await carts.createAndAdd(
      { amount: 700_000, productSlug: 'citra-hops' },
      now,
    );

    const outcomes = await Promise.all([
      carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
      carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
    ]);
    expect(outcomes.sort()).toEqual(['not_present', 'succeeded']);
    const merged = await carts.getCart(
      await requireAccount(userIds[0], 'session-final'),
      now,
    );
    expect(merged.items).toEqual([
      expect.objectContaining({ amount: 700_000, productSlug: 'citra-hops' }),
    ]);
  });

  it('cannot attach one guest cart to two accounts', async () => {
    const guest = await carts.createAndAdd(
      { amount: 100_000, productSlug: 'citra-hops' },
      now,
    );
    await Promise.all([
      carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
      carts.mergeGuestIntoAccount(userIds[1], guest.rawToken, now),
    ]);
    const ownedWithLine = await prisma.cart.count({
      where: {
        items: { some: { product: { slug: 'citra-hops' } } },
        userId: { in: [...userIds] },
      },
    });
    expect(ownedWithLine).toBe(1);
  });

  async function requireAccount(userId: string, rawToken: string) {
    const account = await carts.authenticateAccount(userId, rawToken);
    if (!account) throw new Error('Expected account cart');
    return account;
  }
});
