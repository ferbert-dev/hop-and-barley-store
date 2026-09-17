import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe.each([
  '20260905120000_use_eur_product_currency',
  '20260917100000_reconcile_product_currency_eur',
])('EUR product-currency migration contract: %s', (migrationName) => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations',
      migrationName,
      'migration.sql',
    ),
    'utf8',
  );

  it('fails closed before changing USD products or the default', () => {
    const lock = migration.indexOf(
      'LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE',
    );
    const guard = migration.indexOf("WHERE \"currency\" NOT IN ('EUR', 'USD')");
    const update = migration.indexOf('UPDATE "Product"');
    const alterDefault = migration.indexOf(
      'ALTER COLUMN "currency" SET DEFAULT \'EUR\'',
    );

    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(lock).toBeGreaterThan(-1);
    expect(migration).toContain('RAISE EXCEPTION');
    expect(guard).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(guard);
    expect(alterDefault).toBeGreaterThan(update);
  });

  it('changes only USD product currency and preserves order history', () => {
    expect(migration).toContain('SET "currency" = \'EUR\'');
    expect(migration).toContain('WHERE "currency" = \'USD\'');
    expect(migration).not.toMatch(/UPDATE\s+"Order"/);
    expect(migration).not.toMatch(/UPDATE\s+"OrderItem"/);
    expect(migration).not.toContain('"updatedAt"');
    expect(migration).not.toContain('"priceMinor"');
  });
});
