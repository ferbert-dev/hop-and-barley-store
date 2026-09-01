-- F5 rollback removes only the derived search document and its index.

BEGIN;

DROP INDEX IF EXISTS "Product_searchDocument_idx";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "searchDocument";

COMMIT;
