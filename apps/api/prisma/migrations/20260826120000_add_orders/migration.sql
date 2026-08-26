-- O2 is additive. Existing users, carts, reservations, products and stock are
-- preserved. A pre-O2 runtime may be restored while these tables remain.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CartReservation" WHERE "status" = 'CONSUMED'
  ) THEN
    RAISE EXCEPTION 'O2 migration found consumed reservations without an order owner';
  END IF;
END
$$;

CREATE TYPE "OrderStatus" AS ENUM (
  'PLACED',
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED'
);

CREATE TYPE "PaymentMethod" AS ENUM (
  'STRIPE_DEBIT_CARD',
  'CASH_ON_DELIVERY'
);

CREATE TYPE "PaymentState" AS ENUM (
  'PENDING',
  'PAID',
  'DUE_ON_DELIVERY',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "Order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "cartId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" BYTEA NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentState" "PaymentState" NOT NULL,
  "providerPaymentReference" VARCHAR(255),
  "currency" VARCHAR(3) NOT NULL,
  "itemSubtotalMinor" INTEGER NOT NULL,
  "shippingMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "fullName" VARCHAR(200) NOT NULL,
  "phoneNumber" VARCHAR(32) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "shippingAddress" VARCHAR(500) NOT NULL,
  "placedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_requestHash_length_check" CHECK (octet_length("requestHash") = 32),
  CONSTRAINT "Order_amounts_check" CHECK (
    "itemSubtotalMinor" >= 0
    AND "shippingMinor" = 500
    AND "totalMinor" = "itemSubtotalMinor" + "shippingMinor"
  ),
  CONSTRAINT "Order_contact_snapshot_check" CHECK (
    char_length("fullName") BETWEEN 1 AND 200
    AND "fullName" = btrim("fullName")
    AND char_length("phoneNumber") BETWEEN 3 AND 32
    AND "phoneNumber" = btrim("phoneNumber")
    AND char_length("city") BETWEEN 1 AND 120
    AND "city" = btrim("city")
    AND char_length("shippingAddress") BETWEEN 1 AND 500
    AND "shippingAddress" = btrim("shippingAddress")
  ),
  CONSTRAINT "Order_payment_outcome_check" CHECK (
    (
      "paymentMethod" = 'CASH_ON_DELIVERY'
      AND "paymentState" = 'DUE_ON_DELIVERY'
      AND "paidAt" IS NULL
      AND "providerPaymentReference" IS NULL
      AND "status" <> 'PAID'
    )
    OR
    (
      "paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND "paymentState" = 'PAID'
      AND "paidAt" IS NOT NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "status" <> 'PLACED'
    )
  )
);

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productSlug" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "priceQualifier" VARCHAR(64) NOT NULL,
  "unitPriceMinor" INTEGER NOT NULL,
  "quantity" SMALLINT NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_quantity_check" CHECK ("quantity" BETWEEN 1 AND 99),
  CONSTRAINT "OrderItem_amounts_check" CHECK (
    "unitPriceMinor" >= 0
    AND "lineTotalMinor"::bigint = "unitPriceMinor"::bigint * "quantity"::bigint
  ),
  CONSTRAINT "OrderItem_snapshot_check" CHECK (
    char_length("productSlug") BETWEEN 1 AND 255
    AND char_length("productName") BETWEEN 1 AND 500
    AND char_length("priceQualifier") BETWEEN 1 AND 64
  )
);

ALTER TABLE "CartReservation" ADD COLUMN "orderId" UUID;

CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId");
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key"
  ON "Order"("userId", "idempotencyKey");
CREATE UNIQUE INDEX "Order_providerPaymentReference_key"
  ON "Order"("providerPaymentReference");
CREATE INDEX "Order_userId_placedAt_id_idx"
  ON "Order"("userId", "placedAt", "id");
CREATE INDEX "Order_status_placedAt_idx" ON "Order"("status", "placedAt");
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key"
  ON "OrderItem"("orderId", "productId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "CartReservation_orderId_idx" ON "CartReservation"("orderId");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CartReservation"
  ADD CONSTRAINT "CartReservation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CartReservation_order_state_check" CHECK (
    "orderId" IS NULL
    OR ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL)
  );
