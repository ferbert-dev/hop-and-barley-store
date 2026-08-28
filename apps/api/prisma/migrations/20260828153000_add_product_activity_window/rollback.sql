-- M2 rollback removes only the optional activity-window persistence.

BEGIN;

ALTER TABLE "Product"
  DROP CONSTRAINT "Product_activity_window_check",
  DROP COLUMN "activeUntil",
  DROP COLUMN "activeFrom";

COMMIT;
