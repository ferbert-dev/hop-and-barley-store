import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = join(
  process.cwd(),
  'prisma/migrations/20260909120000_add_guest_checkout_drafts',
);
const migration = readFileSync(join(directory, 'migration.sql'), 'utf8');
const recovery = readFileSync(join(directory, 'RECOVERY.md'), 'utf8');

describe('O2G additive migration contract', () => {
  it('adds a mutually exclusive account or hashed guest owner', () => {
    expect(migration).toContain('"CheckoutDraft_owner_check"');
    expect(migration).toContain('octet_length("guestCapabilityDigest") = 32');
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain('"CheckoutDraft_cartId_key"');
  });

  it('keeps idempotency database-backed and input-sensitive', () => {
    expect(migration).toContain('"CheckoutDraftRequest"');
    expect(migration).toContain(
      '"CheckoutDraftRequest_draftId_idempotencyKey_key"',
    );
    expect(migration).toContain(
      '"CheckoutDraftRequest_requestHash_length_check"',
    );
    expect(migration).toContain('"responseSnapshot" JSONB NOT NULL');
  });

  it('does not rewrite orders, carts, users or inventory', () => {
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE FROM|TRUNCATE)\s+"(?:Order|Cart|User|Product)"/,
    );
    expect(migration).not.toMatch(/stockAmount|CartReservation/);
  });

  it('documents forward, history-preserving recovery', () => {
    expect(recovery).toMatch(/does not rewrite users, carts, orders/i);
    expect(recovery).toMatch(/must never delete carts or orders/i);
    expect(recovery).toMatch(
      /Never edit this applied migration, reset PostgreSQL/i,
    );
  });
});
