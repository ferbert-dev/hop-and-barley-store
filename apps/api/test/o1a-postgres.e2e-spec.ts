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
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'o1a-limit-' } },
    });
    await prisma.product.updateMany({
      data: { stockAmount: 0 },
      where: {
        slug: {
          in: [
            'cascade-hops',
            'centennial-hops',
            'citra-hops',
            'mosaic-hops',
            'saaz-hops',
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.cartReservation.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'o1a-limit-' } },
    });
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

  it('merges account-only, guest-only, max-both-ways, and equal overlap without inventory mutation', async () => {
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
    await carts.add(
      account,
      { amount: 200_000, productSlug: 'centennial-hops' },
      now,
    );
    await carts.add(
      account,
      { amount: 100_000, productSlug: 'saaz-hops' },
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
      { amount: 200_000, productSlug: 'centennial-hops' },
      now,
    );
    await carts.add(
      guestAccess,
      { amount: 300_000, productSlug: 'saaz-hops' },
      now,
    );
    await carts.add(
      guestAccess,
      { amount: 400_000, productSlug: 'mosaic-hops' },
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
          amount: 100_000,
          productSlug: 'cascade-hops',
        }),
        expect.objectContaining({
          amount: 200_000,
          productSlug: 'centennial-hops',
        }),
        expect.objectContaining({ amount: 300_000, productSlug: 'saaz-hops' }),
        expect.objectContaining({
          amount: 400_000,
          productSlug: 'mosaic-hops',
        }),
      ]),
    );
    expect(await prisma.cartReservation.count()).toBe(0);
    expect(
      await prisma.product.findMany({
        orderBy: { slug: 'asc' },
        select: { slug: true, stockAmount: true },
        where: {
          slug: {
            in: [
              'cascade-hops',
              'centennial-hops',
              'citra-hops',
              'mosaic-hops',
              'saaz-hops',
            ],
          },
        },
      }),
    ).toEqual([
      { slug: 'cascade-hops', stockAmount: 0 },
      { slug: 'centennial-hops', stockAmount: 0 },
      { slug: 'citra-hops', stockAmount: 0 },
      { slug: 'mosaic-hops', stockAmount: 0 },
      { slug: 'saaz-hops', stockAmount: 0 },
    ]);
  });

  it('rejects a guest-only adoption when a line is no longer canonical', async () => {
    const guest = await carts.createAndAdd(
      { amount: 500_000, productSlug: 'citra-hops' },
      now,
    );
    const original = await prisma.product.findUniqueOrThrow({
      select: { maximumOrderAmount: true },
      where: { slug: 'citra-hops' },
    });
    try {
      await prisma.product.update({
        data: { maximumOrderAmount: 100_000 },
        where: { slug: 'citra-hops' },
      });

      await expect(
        carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        carts.authenticate(guest.rawToken, now),
      ).resolves.not.toBeNull();
      await expect(
        carts.authenticateAccount(userIds[0], 'session'),
      ).resolves.toBeNull();
    } finally {
      await prisma.product.update({
        data: { maximumOrderAmount: original.maximumOrderAmount },
        where: { slug: 'citra-hops' },
      });
    }
  });

  it('rejects a 51-line guest adoption and retains the guest capability', async () => {
    const guest = await carts.createAndAdd(
      { amount: 100_000, productSlug: 'citra-hops' },
      now,
    );
    const base = await prisma.product.findUniqueOrThrow({
      where: { slug: 'citra-hops' },
    });
    await prisma.product.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        amountUnit: base.amountUnit,
        categoryId: base.categoryId,
        description: 'O1A line-limit fixture',
        imagePath: base.imagePath,
        minimumOrderAmount: base.minimumOrderAmount,
        name: `O1A limit ${String(index)}`,
        orderStepAmount: base.orderStepAmount,
        priceBasisAmount: base.priceBasisAmount,
        priceMinor: base.priceMinor,
        priceQualifier: base.priceQualifier,
        saleKind: base.saleKind,
        slug: `o1a-limit-${String(index)}`,
        specifications: [{ label: 'Fixture', value: 'O1A' }],
        teaser: 'O1A line-limit fixture',
      })),
    });
    const generated = await prisma.product.findMany({
      select: { id: true },
      where: { slug: { startsWith: 'o1a-limit-' } },
    });
    const guestAccess = await carts.authenticate(guest.rawToken, now);
    if (!guestAccess) throw new Error('Expected guest cart');
    await prisma.cartItem.createMany({
      data: generated.map(({ id: productId }) => ({
        amount: 100_000,
        cartId: guestAccess.cartId,
        productId,
      })),
    });

    await expect(
      carts.mergeGuestIntoAccount(userIds[0], guest.rawToken, now),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      carts.authenticate(guest.rawToken, now),
    ).resolves.not.toBeNull();
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
