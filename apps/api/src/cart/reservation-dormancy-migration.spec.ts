import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationDirectory = join(
  process.cwd(),
  'prisma/migrations/20260827150000_disable_cart_reservations',
);
const migration = readFileSync(
  join(migrationDirectory, 'migration.sql'),
  'utf8',
);
const recovery = readFileSync(join(migrationDirectory, 'RECOVERY.md'), 'utf8');

describe('O2S reservation dormancy migration', () => {
  it('transitions stale and live ACTIVE history before installing write guards', () => {
    expect(migration).toContain('WHEN "expiresAt" <= migration_at');
    expect(migration).toContain('THEN \'EXPIRED\'::"CartReservationStatus"');
    expect(migration).toContain('ELSE \'RELEASED\'::"CartReservationStatus"');
    expect(migration).toContain('SET "currentReservationId" = NULL');
    expect(migration).toContain('"status" <> \'ACTIVE\'');
    expect(migration).toContain('"currentReservationId" IS NULL');
    expect(migration.indexOf('WHERE "status" = \'ACTIVE\'')).toBeLessThan(
      migration.indexOf('CartReservation_dormant_status_check'),
    );
  });

  it('enforces the canonical per-product weight lattice and 100 kg ceiling', () => {
    expect(migration).toContain('"minimumOrderAmount" = 100000');
    expect(migration).toContain('"orderStepAmount" = 100000');
    expect(migration).toContain(
      'COALESCE("maximumOrderAmount", 100000000) <= 100000000',
    );
  });

  it('documents a forward-only, history-preserving recovery boundary', () => {
    expect(recovery).toMatch(
      /preserves every cart, cart line, reservation, order/i,
    );
    expect(recovery).toMatch(/do not turn[\s\S]*back into `ACTIVE`/i);
    expect(recovery).toMatch(
      /Never edit applied migrations, reset the database/i,
    );
  });
});
