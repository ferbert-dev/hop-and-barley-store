-- O1B is additive and preserves every existing Cart and CartItem. Existing
-- pre-O1B lines intentionally start unreserved and require explicit recheck.

-- CreateEnum
CREATE TYPE "CartReservationStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'RELEASED',
  'CONSUMED'
);

-- CreateTable
CREATE TABLE "CartReservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cartId" UUID NOT NULL,
  "cartItemId" UUID,
  "productId" UUID NOT NULL,
  "quantity" SMALLINT NOT NULL,
  "status" "CartReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reservedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CartReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CartReservation_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "CartReservation_exact_lifetime_check" CHECK (
    "expiresAt" = "reservedAt" + interval '15 minutes'
  ),
  CONSTRAINT "CartReservation_state_check" CHECK (
    ("status" IN ('ACTIVE', 'EXPIRED') AND "releasedAt" IS NULL AND "consumedAt" IS NULL)
    OR
    ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "consumedAt" IS NULL AND "releasedAt" >= "reservedAt")
    OR
    ("status" = 'CONSUMED' AND "releasedAt" IS NULL AND "consumedAt" IS NOT NULL AND "consumedAt" >= "reservedAt" AND "consumedAt" < "expiresAt")
  ),
  CONSTRAINT "CartReservation_line_state_check" CHECK (
    "cartItemId" IS NOT NULL OR "status" <> 'ACTIVE'
  )
);

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN "currentReservationId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "CartReservation_cartItemId_active_key"
  ON "CartReservation"("cartItemId")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "CartReservation_cartId_status_expiresAt_idx"
  ON "CartReservation"("cartId", "status", "expiresAt");
CREATE INDEX "CartReservation_cartItemId_reservedAt_idx"
  ON "CartReservation"("cartItemId", "reservedAt");
CREATE INDEX "CartReservation_productId_status_expiresAt_idx"
  ON "CartReservation"("productId", "status", "expiresAt");
CREATE UNIQUE INDEX "CartItem_currentReservationId_key"
  ON "CartItem"("currentReservationId");

-- AddForeignKey
ALTER TABLE "CartReservation"
  ADD CONSTRAINT "CartReservation_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartReservation"
  ADD CONSTRAINT "CartReservation_cartItemId_fkey"
  FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CartReservation"
  ADD CONSTRAINT "CartReservation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_currentReservationId_fkey"
  FOREIGN KEY ("currentReservationId") REFERENCES "CartReservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
