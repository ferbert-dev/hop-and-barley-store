import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20260910100000_add_first_purchase_discount_claims/migration.sql',
  ),
  'utf8',
);

describe('O2D migration contract', () => {
  it('adds provider-neutral immutable attempts and exact line snapshots', () => {
    expect(migration).toContain('CREATE TABLE "PaymentAttempt"');
    expect(migration).toContain('CREATE TABLE "PaymentAttemptItem"');
    expect(migration).toContain('"PaymentAttempt_immutable_snapshot_trigger"');
    expect(migration).toContain('"PaymentAttemptItem_immutable_write_trigger"');
    expect(migration).toContain(
      '"PaymentAttempt_sealed_before_commit_trigger"',
    );
    expect(migration).toContain(
      'PaymentAttempt snapshot seal must be established by guarded transition',
    );
    expect(migration).toMatch(
      /FROM "PaymentAttempt"[\s\S]*WHERE "id" = NEW\."paymentAttemptId"[\s\S]*FOR UPDATE/,
    );
    expect(migration).toContain('"FirstPurchaseDiscountClaim_history_trigger"');
    expect(migration).toContain('"PaymentAttempt_claim_consistency_trigger"');
    expect(migration).toContain(
      '"FirstPurchaseDiscountClaim_attempt_consistency_trigger"',
    );
    expect(migration).toContain('"Order_payment_attempt_consistency_trigger"');
    expect(migration).toContain(
      '"OrderItem_payment_attempt_consistency_trigger"',
    );
    expect(migration).toContain(
      'Successful PaymentAttempt requires its exact paid order',
    );
    expect(migration).toMatch(/"lineTotalMinor"::bigint\s*=\s*\(\(2 \*/);
  });

  it('keeps one claimed-or-consumed benefit per account in PostgreSQL', () => {
    expect(migration).toContain(
      '"FirstPurchaseDiscountClaim_one_active_or_consumed_per_user_key"',
    );
    expect(migration).toMatch(/WHERE "status" IN \('CLAIMED', 'CONSUMED'\)/);
    expect(migration).toContain(
      '"FirstPurchaseDiscountClaim_attempt_user_fkey"',
    );
  });

  it('enforces the approved half-up discount formula and shipping exclusion', () => {
    expect(migration).toMatch(
      /"discountMinor"::bigint\s*=\s*\(\("itemSubtotalMinor"::bigint \* 600 \+ 5000\) \/ 10000\)/,
    );
    expect(migration).toMatch(/"shippingMinor" = 500/);
    expect(migration).toMatch(
      /"totalMinor"::bigint =\s*"itemSubtotalMinor"::bigint - "discountMinor"::bigint \+ "shippingMinor"::bigint/,
    );
  });

  it('defaults historical orders to an explicit no-discount snapshot', () => {
    expect(migration).toContain(
      'ADD COLUMN "discountKind" "DiscountKind" NOT NULL DEFAULT \'NONE\'',
    );
    expect(migration).toContain(
      'ADD COLUMN "discountPolicyVersion" VARCHAR(64) NOT NULL DEFAULT \'no-discount-v1\'',
    );
  });

  it('is one PostgreSQL transaction with a documented non-destructive recovery', () => {
    expect(migration.trimStart().indexOf('BEGIN;')).toBeGreaterThanOrEqual(0);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    const recovery = readFileSync(
      join(
        process.cwd(),
        'prisma/migrations/20260910100000_add_first_purchase_discount_claims/RECOVERY.md',
      ),
      'utf8',
    );
    expect(recovery).toMatch(
      /disabl[ei][\s\S]*new discounted[\s\S]*payment attempts/i,
    );
    expect(recovery).toMatch(
      /Do not delete attempt, item, claim, or\s+order history/i,
    );
  });
});
