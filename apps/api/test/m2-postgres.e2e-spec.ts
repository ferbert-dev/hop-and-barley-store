import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import { SessionService } from '../src/auth/session/session.service';
import { PasswordHashExecutor } from '../src/auth/password/password-hash-executor';
import { PrismaService } from '../src/database/prisma.service';
import type { AdminProductListResponseDto } from '../src/admin/dto/admin-product-list.dto';
import type { CatalogResponseDto } from '../src/catalog/dto/catalog-response.dto';

const describePostgres =
  process.env.RUN_M2_POSTGRES_INTEGRATION === '1' ? describe : describe.skip;

const categoryId = '62000000-0000-4000-8000-000000000001';
const adminId = '62000000-0000-4000-8000-000000000002';
const productIds = [
  '62000000-0000-4000-8000-000000000010',
  '62000000-0000-4000-8000-000000000011',
  '62000000-0000-4000-8000-000000000012',
  '62000000-0000-4000-8000-000000000013',
];

describePostgres('M2 administrator product list with PostgreSQL 17.6', () => {
  let app: INestApplication;
  let postgres: Client;
  let prisma: PrismaService;
  let adminCookie: string;

  beforeAll(async () => {
    postgres = new Client({ connectionString: process.env.DATABASE_URL });
    await postgres.connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.category.create({
      data: {
        displayOrder: 99,
        id: categoryId,
        name: 'M2 lifecycle',
        slug: 'm2-lifecycle',
      },
    });
    await prisma.product.createMany({
      data: [
        productFixture({
          id: productIds[0],
          name: 'M2 Active',
          slug: 'm2-active',
        }),
        productFixture({
          activeFrom: new Date('2100-01-01T00:00:00.000Z'),
          id: productIds[1],
          isActive: false,
          name: 'M2 Disabled',
          slug: 'm2-disabled',
        }),
        productFixture({
          activeFrom: new Date('2100-01-01T00:00:00.000Z'),
          activeUntil: new Date('2100-02-01T00:00:00.000Z'),
          id: productIds[2],
          name: 'M2 Scheduled',
          slug: 'm2-scheduled',
        }),
        productFixture({
          activeFrom: new Date('2000-01-01T00:00:00.000Z'),
          activeUntil: new Date('2000-02-01T00:00:00.000Z'),
          id: productIds[3],
          name: 'M2 Expired',
          slug: 'm2-expired',
        }),
      ],
    });
    const credential = await app
      .get(PasswordHashExecutor)
      .hash('M2-Disposable-Admin-Password');
    await prisma.user.create({
      data: {
        email: 'm2-admin@example.test',
        id: adminId,
        normalizedEmail: 'm2-admin@example.test',
        passwordCredential: { create: credential },
        role: 'ADMIN',
      },
    });
    const session = await app.get(SessionService).issue(adminId, null);
    adminCookie = `hb_session=${session.rawToken}`;
  });

  it('lists all four lifecycle states while minimizing every admin item', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/admin/products?category=m2-lifecycle&limit=4')
      .set('Cookie', adminCookie)
      .expect(200);
    const body = JSON.parse(response.text) as AdminProductListResponseDto;

    expect(
      body.items.map(({ lifecycleStatus, slug }) => [slug, lifecycleStatus]),
    ).toEqual([
      ['m2-active', 'ACTIVE'],
      ['m2-disabled', 'DISABLED'],
      ['m2-expired', 'EXPIRED'],
      ['m2-scheduled', 'SCHEDULED'],
    ]);
    expect(body.meta).toMatchObject({
      totalItems: 4,
      totalPages: 1,
    });
    expect(body.meta.facets.categories).not.toContainEqual({
      name: 'M2 lifecycle',
      slug: 'm2-lifecycle',
    });
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual([
        'activeFrom',
        'activeUntil',
        'amountUnit',
        'category',
        'createdAt',
        'currency',
        'description',
        'id',
        'isActive',
        'lifecycleStatus',
        'name',
        'priceMinor',
        'priceQualifier',
        'saleKind',
        'slug',
        'stockAmount',
        'updatedAt',
      ]);
      expect(JSON.stringify(item)).not.toMatch(
        /imagePath|specifications|credential|storage|filesystem/i,
      );
    }
  });

  it('keeps the M2 public catalog rule limited to isActive', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/products?category=m2-lifecycle&limit=4')
      .expect(200);
    const body = JSON.parse(response.text) as CatalogResponseDto;

    expect(body.items.map(({ slug }) => slug)).toEqual([
      'm2-active',
      'm2-expired',
      'm2-scheduled',
    ]);
    expect(body.items).not.toContainEqual(
      expect.objectContaining({ slug: 'm2-disabled' }),
    );
  });

  it('enforces the named strict activity-window constraint', async () => {
    await expect(
      postgres.query(
        `UPDATE "Product" SET "activeFrom" = $1, "activeUntil" = $1 WHERE "id" = $2`,
        ['2026-08-28T12:00:00.000Z', productIds[0]],
      ),
    ).rejects.toMatchObject({ constraint: 'Product_activity_window_check' });

    const stored = await postgres.query<{
      activeFrom: Date;
      activeUntil: Date;
    }>(`SELECT "activeFrom", "activeUntil" FROM "Product" WHERE "id" = $1`, [
      productIds[2],
    ]);
    expect(stored.rows[0]?.activeFrom.toISOString()).toBe(
      '2100-01-01T00:00:00.000Z',
    );
    expect(stored.rows[0]?.activeUntil.toISOString()).toBe(
      '2100-02-01T00:00:00.000Z',
    );
  });

  afterAll(async () => {
    await prisma?.authSession.deleteMany({ where: { userId: adminId } });
    await prisma?.user.deleteMany({ where: { id: adminId } });
    await prisma?.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma?.category.deleteMany({ where: { id: categoryId } });
    await postgres?.end();
    await app?.close();
  });
});

function productFixture(overrides: {
  activeFrom?: Date;
  activeUntil?: Date;
  id: string;
  isActive?: boolean;
  name: string;
  slug: string;
}) {
  return {
    amountUnit: 'EACH' as const,
    categoryId,
    currency: 'USD',
    description: `${overrides.name} description`,
    imagePath: `/assets/products/${overrides.slug}.webp`,
    isActive: true,
    maximumOrderAmount: null,
    minimumOrderAmount: 1,
    orderStepAmount: 1,
    packageNetWeightMg: null,
    priceBasisAmount: 1,
    priceMinor: 100,
    priceQualifier: 'each',
    saleKind: 'PACKAGE' as const,
    specifications: [],
    stockAmount: 10,
    teaser: `${overrides.name} teaser`,
    ...overrides,
  };
}
