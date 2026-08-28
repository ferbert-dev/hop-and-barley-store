import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDirectory = resolve(
  __dirname,
  '../../prisma/migrations/20260828163000_align_ingredient_product_types',
);

describe('C1A ingredient Product Type migration contract', () => {
  const migration = readFileSync(
    resolve(migrationDirectory, 'migration.sql'),
    'utf8',
  );
  const rollback = readFileSync(
    resolve(migrationDirectory, 'rollback.sql'),
    'utf8',
  );

  it('renames only the stable malts category label atomically', () => {
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(migration).toContain(`SET "name" = 'Malt'`);
    expect(migration).toContain(`"slug" = 'malts'`);
    expect(migration).toContain(
      `"id" = '10000000-0000-4000-8000-000000000002'`,
    );
    expect(migration).not.toMatch(/DELETE|INSERT|ALTER TABLE/i);
    expect(migration).not.toContain(`"slug" = 'kits'`);
  });

  it('restores the prior label without changing identifiers or products', () => {
    expect(rollback).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(rollback).toContain(`SET "name" = 'Malts'`);
    expect(rollback).toContain(`"slug" = 'malts'`);
    expect(rollback).not.toMatch(/DELETE|INSERT|ALTER TABLE/i);
  });
});
