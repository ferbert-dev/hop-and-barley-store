-- Manual structural rollback for C1. Review and back up the target before use.
-- This preserves Product rows and their pre-C1 columns, but removes C1-only metadata.
-- The expected C1 schema must be present; any error aborts the whole transaction.
BEGIN;

ALTER TABLE "Product"
  DROP CONSTRAINT "Product_categoryId_fkey",
  DROP CONSTRAINT "Product_active_content_check",
  DROP CONSTRAINT "Product_specifications_array_check",
  DROP CONSTRAINT "Product_imagePath_local_check",
  DROP CONSTRAINT "Product_currency_iso_check",
  DROP CONSTRAINT "Product_stockQuantity_nonnegative_check",
  DROP CONSTRAINT "Product_priceMinor_nonnegative_check",
  DROP CONSTRAINT "Product_slug_format_check";

DROP INDEX "Product_categoryId_isActive_idx";
DROP INDEX "Product_isActive_priceMinor_idx";

ALTER TABLE "Product"
  DROP COLUMN "categoryId",
  DROP COLUMN "specifications",
  DROP COLUMN "imagePath",
  DROP COLUMN "isActive",
  DROP COLUMN "stockQuantity",
  DROP COLUMN "priceQualifier",
  DROP COLUMN "teaser",
  ALTER COLUMN "currency" SET DEFAULT 'EUR';

DROP TABLE "Category";

COMMIT;
