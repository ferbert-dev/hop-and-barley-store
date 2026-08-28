import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDirectory = resolve(
  __dirname,
  '../../prisma/migrations/20260828170000_enable_uploaded_product_assets',
);

describe('M3 uploaded product-asset migration contract', () => {
  const migration = readFileSync(
    resolve(migrationDirectory, 'migration.sql'),
    'utf8',
  );
  const rollback = readFileSync(
    resolve(migrationDirectory, 'rollback.sql'),
    'utf8',
  );

  it('preserves bundled images and permits only UUID-v4 WebP upload keys', () => {
    expect(migration).toContain('/assets/products/');
    expect(migration).toContain('/product-assets/');
    expect(migration).toContain('[0-9a-f]{8}');
    expect(migration).toContain('-4[0-9a-f]{3}');
    expect(migration).toContain('-[89ab][0-9a-f]{3}');
    expect(migration).not.toContain('client');
  });

  it('rolls back atomically and refuses to strand uploaded-image products', () => {
    expect(rollback).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(rollback).toContain('WHERE "imagePath" LIKE \'/product-assets/%\'');
    expect(rollback).toContain('RAISE EXCEPTION');
    expect(rollback).not.toContain('DELETE FROM "Product"');
  });
});
