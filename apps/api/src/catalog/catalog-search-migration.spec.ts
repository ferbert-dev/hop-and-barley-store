import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDirectory = resolve(
  __dirname,
  '../../prisma/migrations/20260901110000_add_catalog_full_text_search',
);

describe('F5 catalog full-text search migration contract', () => {
  const migration = readFileSync(
    resolve(migrationDirectory, 'migration.sql'),
    'utf8',
  );
  const rollback = readFileSync(
    resolve(migrationDirectory, 'rollback.sql'),
    'utf8',
  );

  it('stores one weighted search document and indexes it with GIN', () => {
    expect(migration).toContain('ADD COLUMN "searchDocument" tsvector');
    expect(migration).toContain('GENERATED ALWAYS AS');
    expect(migration).toContain("to_tsvector('simple'");
    expect(migration).toContain('USING GIN ("searchDocument")');
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('rolls back only the derived index and column atomically', () => {
    expect(rollback).toContain(
      'DROP INDEX IF EXISTS "Product_searchDocument_idx"',
    );
    expect(rollback).toContain(
      'ALTER TABLE "Product" DROP COLUMN IF EXISTS "searchDocument"',
    );
    expect(rollback).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(rollback).not.toMatch(/DELETE FROM|DROP TABLE/i);
  });
});
