-- Refuse to infer catalog fields for rows outside the approved C1 reconciliation set.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Product"
    WHERE "slug" NOT IN (
      'house-lager',
      'citrus-pale-ale',
      'caramel-malt',
      'cascade-hops',
      'centennial-hops',
      'citra-hops',
      'imperial-yeast',
      'maris-otter-malt',
      'mosaic-hops',
      'pilsner-malt',
      'saaz-hops',
      'safale-us05-yeast',
      'unmalted-wheat',
      'west-coast-ipa-kit'
    )
  ) THEN
    RAISE EXCEPTION 'Unexpected pre-C1 Product rows; migration cannot infer catalog fields safely';
  END IF;
END
$$;

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Category_displayOrder_nonnegative_check" CHECK ("displayOrder" >= 0),
    CONSTRAINT "Category_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- Seed relational reference data needed to backfill existing Product rows.
INSERT INTO "Category" ("id", "name", "slug", "displayOrder", "updatedAt")
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Hops', 'hops', 1, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'Malts', 'malts', 2, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'Yeast', 'yeast', 3, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', 'Adjuncts', 'adjuncts', 4, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', 'Kits', 'kits', 5, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000999', 'Legacy Foundation Fixtures', 'legacy-foundation', 999, CURRENT_TIMESTAMP);

-- AlterTable: add nullable content/relation columns first so known rows can be backfilled.
ALTER TABLE "Product"
  ADD COLUMN "teaser" TEXT,
  ADD COLUMN "priceQualifier" VARCHAR(64),
  ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "imagePath" VARCHAR(255),
  ADD COLUMN "specifications" JSONB,
  ADD COLUMN "categoryId" UUID;

-- Existing approved rows remain hidden until the transactional seed replaces their placeholders.
UPDATE "Product"
SET
  "teaser" = "description",
  "priceQualifier" = 'legacy fixture',
  "isActive" = false,
  "imagePath" = CASE "slug"
    WHEN 'caramel-malt' THEN '/assets/products/caramel-malt.webp'
    WHEN 'cascade-hops' THEN '/assets/products/cascade-hops.webp'
    WHEN 'centennial-hops' THEN '/assets/products/centennial-hops.webp'
    WHEN 'citra-hops' THEN '/assets/products/citra-hops.webp'
    WHEN 'imperial-yeast' THEN '/assets/products/imperial-yeast.webp'
    WHEN 'maris-otter-malt' THEN '/assets/products/maris-otter-malt.webp'
    WHEN 'mosaic-hops' THEN '/assets/products/mosaic-hops.webp'
    WHEN 'pilsner-malt' THEN '/assets/products/pilsner-malt.webp'
    WHEN 'saaz-hops' THEN '/assets/products/saaz-hops.webp'
    WHEN 'safale-us05-yeast' THEN '/assets/products/safale-us05-yeast.webp'
    WHEN 'unmalted-wheat' THEN '/assets/products/unmalted-wheat.webp'
    WHEN 'west-coast-ipa-kit' THEN '/assets/products/west-coast-ipa-kit.webp'
    ELSE '/assets/products/legacy-foundation.webp'
  END,
  "specifications" = '[]'::jsonb,
  "categoryId" = CASE
    WHEN "slug" IN ('caramel-malt', 'maris-otter-malt', 'pilsner-malt')
      THEN '10000000-0000-4000-8000-000000000002'::uuid
    WHEN "slug" IN ('cascade-hops', 'centennial-hops', 'citra-hops', 'mosaic-hops', 'saaz-hops')
      THEN '10000000-0000-4000-8000-000000000001'::uuid
    WHEN "slug" IN ('imperial-yeast', 'safale-us05-yeast')
      THEN '10000000-0000-4000-8000-000000000003'::uuid
    WHEN "slug" = 'unmalted-wheat'
      THEN '10000000-0000-4000-8000-000000000004'::uuid
    WHEN "slug" = 'west-coast-ipa-kit'
      THEN '10000000-0000-4000-8000-000000000005'::uuid
    ELSE '10000000-0000-4000-8000-000000000999'::uuid
  END;

ALTER TABLE "Product"
  ALTER COLUMN "teaser" SET NOT NULL,
  ALTER COLUMN "priceQualifier" SET NOT NULL,
  ALTER COLUMN "imagePath" SET NOT NULL,
  ALTER COLUMN "specifications" SET NOT NULL,
  ALTER COLUMN "categoryId" SET NOT NULL,
  ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AddConstraint
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "Product_priceMinor_nonnegative_check" CHECK ("priceMinor" >= 0),
  ADD CONSTRAINT "Product_stockQuantity_nonnegative_check" CHECK ("stockQuantity" >= 0),
  ADD CONSTRAINT "Product_currency_iso_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Product_imagePath_local_check" CHECK ("imagePath" ~ '^/assets/products/[a-z0-9]+(-[a-z0-9]+)*[.]webp$'),
  ADD CONSTRAINT "Product_specifications_array_check" CHECK (jsonb_typeof("specifications") = 'array'),
  ADD CONSTRAINT "Product_active_content_check" CHECK (
    NOT "isActive" OR (
      btrim("name") <> '' AND
      btrim("teaser") <> '' AND
      btrim("description") <> '' AND
      btrim("priceQualifier") <> ''
    )
  ),
  ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_displayOrder_name_idx" ON "Category"("displayOrder", "name");
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");
CREATE INDEX "Product_isActive_priceMinor_idx" ON "Product"("isActive", "priceMinor");
