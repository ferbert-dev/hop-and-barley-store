-- M3 keeps bundled storefront assets valid while allowing only opaque,
-- server-generated UUID WebP references for administrator uploads.

BEGIN;

ALTER TABLE "Product"
  DROP CONSTRAINT "Product_imagePath_local_check",
  ADD CONSTRAINT "Product_imagePath_local_check" CHECK (
    "imagePath" ~ '^/assets/products/[a-z0-9]+(-[a-z0-9]+)*[.]webp$'
    OR "imagePath" ~ '^/product-assets/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
  );

COMMIT;
