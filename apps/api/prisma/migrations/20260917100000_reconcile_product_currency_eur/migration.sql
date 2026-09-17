-- Repair catalog currency drift after O2C without replaying historical migrations.
-- Numeric prices, inventory, carts and historical order snapshots stay unchanged.
BEGIN;

LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Product" WHERE "currency" NOT IN ('EUR', 'USD')
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile unexpected product currencies';
  END IF;
END
$$;

UPDATE "Product"
SET "currency" = 'EUR'
WHERE "currency" = 'USD';

ALTER TABLE "Product"
  ALTER COLUMN "currency" SET DEFAULT 'EUR';

COMMIT;
