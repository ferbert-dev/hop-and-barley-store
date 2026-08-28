-- Safe rollback refuses to strand products whose image reference depends on
-- M3. Retire or forward-correct those rows before restoring the old contract.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Product"
    WHERE "imagePath" LIKE '/product-assets/%'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back uploaded product assets while Product rows reference them';
  END IF;
END
$$;

ALTER TABLE "Product"
  DROP CONSTRAINT "Product_imagePath_local_check",
  ADD CONSTRAINT "Product_imagePath_local_check" CHECK (
    "imagePath" ~ '^/assets/products/[a-z0-9]+(-[a-z0-9]+)*[.]webp$'
  );

COMMIT;
