-- O2S makes reservations dormant without deleting history. Cart lines become
-- desired amounts only; stock is allocated once, during order creation.

BEGIN;

LOCK TABLE "CartItem", "CartReservation" IN SHARE ROW EXCLUSIVE MODE;

DO $o2s_dormancy$
DECLARE
  migration_at timestamp(3) := clock_timestamp()::timestamp(3);
BEGIN
  UPDATE "CartReservation"
  SET
    "status" = CASE
      WHEN "expiresAt" <= migration_at
        THEN 'EXPIRED'::"CartReservationStatus"
      ELSE 'RELEASED'::"CartReservationStatus"
    END,
    "releasedAt" = CASE
      WHEN "expiresAt" <= migration_at THEN NULL
      ELSE GREATEST(migration_at, "reservedAt")
    END,
    "consumedAt" = NULL,
    "updatedAt" = migration_at
  WHERE "status" = 'ACTIVE';

  UPDATE "CartItem"
  SET "currentReservationId" = NULL, "updatedAt" = migration_at
  WHERE "currentReservationId" IS NOT NULL;

  IF EXISTS (SELECT 1 FROM "CartReservation" WHERE "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'O2S dormancy failed: ACTIVE reservations remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CartItem" WHERE "currentReservationId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'O2S dormancy failed: current reservation pointers remain';
  END IF;
END
$o2s_dormancy$;

ALTER TABLE "CartReservation"
  ALTER COLUMN "status" SET DEFAULT 'EXPIRED',
  ADD CONSTRAINT "CartReservation_dormant_status_check" CHECK (
    "status" <> 'ACTIVE'
  );

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_currentReservation_dormant_check" CHECK (
    "currentReservationId" IS NULL
  );

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_weight_order_lattice_check" CHECK (
    "saleKind" <> 'WEIGHT'
    OR (
      "amountUnit" = 'MILLIGRAM'
      AND "minimumOrderAmount" = 100000
      AND "orderStepAmount" = 100000
      AND COALESCE("maximumOrderAmount", 100000000) <= 100000000
    )
  );

COMMIT;
