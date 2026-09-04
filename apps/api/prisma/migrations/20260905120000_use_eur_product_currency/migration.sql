-- O2C changes the current product catalogue from USD to EUR without
-- converting numeric prices or rewriting historical order snapshots.

BEGIN;

LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Product"
    WHERE "currency" NOT IN ('EUR', 'USD')
  ) THEN
    RAISE EXCEPTION 'O2C cannot migrate unexpected product currencies';
  END IF;
END
$$;

UPDATE "Product"
SET "currency" = 'EUR'
WHERE "currency" = 'USD';

ALTER TABLE "Product"
  ALTER COLUMN "currency" SET DEFAULT 'EUR';

COMMIT;
