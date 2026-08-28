-- M2 stores optional UTC product activity windows without changing the
-- existing manual isActive flag or applying the window to public queries.

BEGIN;

ALTER TABLE "Product"
  ADD COLUMN "activeFrom" TIMESTAMPTZ(3),
  ADD COLUMN "activeUntil" TIMESTAMPTZ(3),
  ADD CONSTRAINT "Product_activity_window_check" CHECK (
    "activeFrom" IS NULL
    OR "activeUntil" IS NULL
    OR "activeUntil" > "activeFrom"
  );

COMMIT;
