import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260929090000_add_purchase_likes/migration.sql',
  ),
  'utf8',
);

describe('O3L purchase Like migration contract', () => {
  it('enforces one Like for each exact confirmed Stripe purchase', () => {
    expect(migration).toContain('CREATE TABLE "PurchaseLike"');
    expect(migration).toContain('"PurchaseLike_paymentAttemptId_key"');
    expect(migration).toContain('"PurchaseLike_orderId_key"');
    expect(migration).toContain('"PurchaseLike_eligible_payment_trigger"');
    expect(migration).toContain('attempt."status" = \'SUCCEEDED\'');
    expect(migration).toContain(
      'purchase."paymentMethod" = \'STRIPE_DEBIT_CARD\'',
    );
    expect(migration).toContain('purchase."paymentState" = \'PAID\'');
    expect(migration).toContain('purchase."status" = \'PAID\'');
  });

  it('is atomic and documents non-destructive recovery', () => {
    expect(migration.indexOf('BEGIN;')).toBeGreaterThanOrEqual(0);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    const recovery = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260929090000_add_purchase_likes/RECOVERY.md',
      ),
      'utf8',
    );
    expect(recovery).toMatch(/Do not delete.*PaymentAttempt.*Order/is);
  });
});
