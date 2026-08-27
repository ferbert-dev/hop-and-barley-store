-- O2Q replaces count-only commerce amounts with explicit sale rules. Column
-- renames preserve row identity; live measured rows are converted explicitly.
-- Historical OrderItem arithmetic is backfilled as the legacy EACH x quantity
-- contract and is never re-priced.

BEGIN;

CREATE TYPE "SaleKind" AS ENUM ('WEIGHT', 'PACKAGE', 'KIT');
CREATE TYPE "AmountUnit" AS ENUM ('MILLIGRAM', 'EACH');

ALTER TABLE "Product"
  RENAME COLUMN "stockQuantity" TO "stockAmount";

ALTER TABLE "Product"
  ADD COLUMN "saleKind" "SaleKind",
  ADD COLUMN "amountUnit" "AmountUnit",
  ADD COLUMN "priceBasisAmount" INTEGER,
  ADD COLUMN "minimumOrderAmount" INTEGER,
  ADD COLUMN "orderStepAmount" INTEGER,
  ADD COLUMN "maximumOrderAmount" INTEGER,
  ADD COLUMN "packageNetWeightMg" INTEGER,
  ADD COLUMN "kitYieldVolumeMl" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Product"
    WHERE
      ("slug" IN ('caramel-malt', 'maris-otter-malt', 'pilsner-malt', 'unmalted-wheat')
        AND "stockAmount" > 4409)
      OR
      ("slug" IN ('cascade-hops', 'centennial-hops', 'citra-hops', 'mosaic-hops', 'saaz-hops')
        AND "stockAmount" > 20000)
  ) THEN
    RAISE EXCEPTION 'O2Q Product stock backfill would exceed the canonical amount bound';
  END IF;
END
$$;

UPDATE "Product"
SET
  "saleKind" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'cascade-hops', 'centennial-hops', 'citra-hops',
      'maris-otter-malt', 'mosaic-hops', 'pilsner-malt', 'saaz-hops',
      'unmalted-wheat'
    ) THEN 'WEIGHT'::"SaleKind"
    WHEN "slug" = 'west-coast-ipa-kit' THEN 'KIT'::"SaleKind"
    ELSE 'PACKAGE'::"SaleKind"
  END,
  "amountUnit" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'cascade-hops', 'centennial-hops', 'citra-hops',
      'maris-otter-malt', 'mosaic-hops', 'pilsner-malt', 'saaz-hops',
      'unmalted-wheat'
    ) THEN 'MILLIGRAM'::"AmountUnit"
    ELSE 'EACH'::"AmountUnit"
  END,
  "priceBasisAmount" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'cascade-hops', 'centennial-hops', 'citra-hops',
      'maris-otter-malt', 'mosaic-hops', 'pilsner-malt', 'saaz-hops',
      'unmalted-wheat'
    ) THEN 100000
    ELSE 1
  END,
  "minimumOrderAmount" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'cascade-hops', 'centennial-hops', 'citra-hops',
      'maris-otter-malt', 'mosaic-hops', 'pilsner-malt', 'saaz-hops',
      'unmalted-wheat'
    ) THEN 100000
    ELSE 1
  END,
  "orderStepAmount" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'cascade-hops', 'centennial-hops', 'citra-hops',
      'maris-otter-malt', 'mosaic-hops', 'pilsner-malt', 'saaz-hops',
      'unmalted-wheat'
    ) THEN 5000
    ELSE 1
  END,
  "stockAmount" = CASE
    WHEN "slug" IN (
      'caramel-malt', 'maris-otter-malt', 'pilsner-malt', 'unmalted-wheat'
    ) THEN "stockAmount" * 453592
    WHEN "slug" IN (
      'cascade-hops', 'centennial-hops', 'citra-hops', 'mosaic-hops', 'saaz-hops'
    ) THEN "stockAmount" * 100000
    ELSE "stockAmount"
  END,
  "packageNetWeightMg" = CASE
    WHEN "slug" = 'safale-us05-yeast' THEN 11500
    ELSE NULL
  END,
  "kitYieldVolumeMl" = CASE
    WHEN "slug" = 'west-coast-ipa-kit' THEN 18927
    ELSE NULL
  END;

-- Convert approved per-pound bulk fixtures to the nearest cent per 100 g.
-- 1 lb = 453.59237 g. Hops were already priced per 100 g.
UPDATE "Product"
SET
  "priceMinor" = CASE "slug"
    WHEN 'maris-otter-malt' THEN 55
    WHEN 'caramel-malt' THEN 66
    WHEN 'pilsner-malt' THEN 49
    WHEN 'unmalted-wheat' THEN 40
    ELSE "priceMinor"
  END,
  "priceQualifier" = CASE
    WHEN "saleKind" = 'WEIGHT' THEN 'per 100g'
    ELSE "priceQualifier"
  END;

ALTER TABLE "Product"
  ALTER COLUMN "saleKind" SET NOT NULL,
  ALTER COLUMN "amountUnit" SET NOT NULL,
  ALTER COLUMN "priceBasisAmount" SET NOT NULL,
  ALTER COLUMN "minimumOrderAmount" SET NOT NULL,
  ALTER COLUMN "orderStepAmount" SET NOT NULL,
  DROP CONSTRAINT "Product_stockQuantity_nonnegative_check",
  ADD CONSTRAINT "Product_stockAmount_nonnegative_check" CHECK (
    "stockAmount" BETWEEN 0 AND 2000000000
  ),
  ADD CONSTRAINT "Product_sale_amounts_check" CHECK (
    "priceBasisAmount" BETWEEN 1 AND 2000000000
    AND "minimumOrderAmount" BETWEEN 1 AND 2000000000
    AND "orderStepAmount" BETWEEN 1 AND 2000000000
    AND (
      "maximumOrderAmount" IS NULL
      OR (
        "maximumOrderAmount" BETWEEN "minimumOrderAmount" AND 2000000000
        AND ("maximumOrderAmount" - "minimumOrderAmount") % "orderStepAmount" = 0
      )
    )
  ),
  ADD CONSTRAINT "Product_sale_kind_check" CHECK (
    (
      "saleKind" = 'WEIGHT'
      AND "amountUnit" = 'MILLIGRAM'
      AND "packageNetWeightMg" IS NULL
      AND "kitYieldVolumeMl" IS NULL
    )
    OR (
      "saleKind" = 'PACKAGE'
      AND "amountUnit" = 'EACH'
      AND "kitYieldVolumeMl" IS NULL
    )
    OR (
      "saleKind" = 'KIT'
      AND "amountUnit" = 'EACH'
      AND "packageNetWeightMg" IS NULL
    )
  ),
  ADD CONSTRAINT "Product_optional_physical_amounts_check" CHECK (
    ("packageNetWeightMg" IS NULL OR "packageNetWeightMg" > 0)
    AND ("kitYieldVolumeMl" IS NULL OR "kitYieldVolumeMl" > 0)
  );

ALTER TABLE "CartItem"
  DROP CONSTRAINT "CartItem_quantity_check";
ALTER TABLE "CartItem"
  RENAME COLUMN "quantity" TO "amount";
ALTER TABLE "CartItem"
  ALTER COLUMN "amount" TYPE INTEGER;
UPDATE "CartItem" item
SET "amount" = CASE
  WHEN product."slug" IN (
    'caramel-malt', 'maris-otter-malt', 'pilsner-malt', 'unmalted-wheat'
  ) THEN ((item."amount" * 453592 + 2500) / 5000) * 5000
  WHEN product."slug" IN (
    'cascade-hops', 'centennial-hops', 'citra-hops', 'mosaic-hops', 'saaz-hops'
  ) THEN item."amount" * 100000
  ELSE item."amount"
END
FROM "Product" product
WHERE product."id" = item."productId";
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_amount_check" CHECK (
    "amount" BETWEEN 1 AND 2000000000
  );

ALTER TABLE "CartReservation"
  DROP CONSTRAINT "CartReservation_quantity_check";
ALTER TABLE "CartReservation"
  RENAME COLUMN "quantity" TO "amount";
ALTER TABLE "CartReservation"
  ALTER COLUMN "amount" TYPE INTEGER;
UPDATE "CartReservation" reservation
SET "amount" = CASE
  WHEN product."slug" IN (
    'caramel-malt', 'maris-otter-malt', 'pilsner-malt', 'unmalted-wheat'
  ) THEN ((reservation."amount" * 453592 + 2500) / 5000) * 5000
  WHEN product."slug" IN (
    'cascade-hops', 'centennial-hops', 'citra-hops', 'mosaic-hops', 'saaz-hops'
  ) THEN reservation."amount" * 100000
  ELSE reservation."amount"
END
FROM "Product" product
WHERE product."id" = reservation."productId";
ALTER TABLE "CartReservation"
  ADD CONSTRAINT "CartReservation_amount_check" CHECK (
    "amount" BETWEEN 1 AND 2000000000
  );

ALTER TABLE "OrderItem"
  DROP CONSTRAINT "OrderItem_quantity_check",
  DROP CONSTRAINT "OrderItem_amounts_check";
ALTER TABLE "OrderItem"
  RENAME COLUMN "unitPriceMinor" TO "priceMinor";
ALTER TABLE "OrderItem"
  RENAME COLUMN "quantity" TO "amount";
ALTER TABLE "OrderItem"
  ALTER COLUMN "amount" TYPE INTEGER,
  ADD COLUMN "saleKind" "SaleKind",
  ADD COLUMN "amountUnit" "AmountUnit",
  ADD COLUMN "priceBasisAmount" INTEGER;

-- Legacy rows remain exact: old price x old count = stored line total. They are
-- not reinterpreted from today's product rules or today's fixture prices.
UPDATE "OrderItem"
SET
  "saleKind" = 'PACKAGE',
  "amountUnit" = 'EACH',
  "priceBasisAmount" = 1;

ALTER TABLE "OrderItem"
  ALTER COLUMN "saleKind" SET NOT NULL,
  ALTER COLUMN "amountUnit" SET NOT NULL,
  ALTER COLUMN "priceBasisAmount" SET NOT NULL,
  ADD CONSTRAINT "OrderItem_amount_check" CHECK (
    "amount" BETWEEN 1 AND 2000000000
  ),
  ADD CONSTRAINT "OrderItem_pricing_check" CHECK (
    "priceMinor" >= 0
    AND "priceBasisAmount" BETWEEN 1 AND 2000000000
    AND "lineTotalMinor"::bigint = (
      (2 * "priceMinor"::bigint * "amount"::bigint + "priceBasisAmount"::bigint)
      / (2 * "priceBasisAmount"::bigint)
    )
  ),
  ADD CONSTRAINT "OrderItem_sale_kind_check" CHECK (
    ("saleKind" = 'WEIGHT' AND "amountUnit" = 'MILLIGRAM')
    OR ("saleKind" IN ('PACKAGE', 'KIT') AND "amountUnit" = 'EACH')
  );

COMMIT;
