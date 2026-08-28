import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationDirectory = resolve(
  __dirname,
  '../../prisma/migrations/20260828153000_add_product_activity_window',
);

describe('M2 product activity-window migration contract', () => {
  const migration = readFileSync(
    resolve(migrationDirectory, 'migration.sql'),
    'utf8',
  );
  const rollback = readFileSync(
    resolve(migrationDirectory, 'rollback.sql'),
    'utf8',
  );

  it('adds nullable UTC millisecond instants with no default or backfill', () => {
    expect(migration).toContain('ADD COLUMN "activeFrom" TIMESTAMPTZ(3)');
    expect(migration).toContain('ADD COLUMN "activeUntil" TIMESTAMPTZ(3)');
    expect(migration).not.toMatch(/DEFAULT/i);
    expect(migration).not.toMatch(/UPDATE\s+"Product"/i);
  });

  it('requires an end instant to be strictly after a start instant', () => {
    expect(migration).toContain('CONSTRAINT "Product_activity_window_check"');
    expect(migration).toContain('"activeUntil" > "activeFrom"');
  });

  it('provides an atomic rollback for exactly the M2 columns and constraint', () => {
    expect(rollback.trimStart().startsWith('--')).toBe(true);
    expect(rollback).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(rollback).toContain(
      'DROP CONSTRAINT "Product_activity_window_check"',
    );
    expect(rollback).toContain('DROP COLUMN "activeUntil"');
    expect(rollback).toContain('DROP COLUMN "activeFrom"');
  });
});
