-- O2D adds immutable, provider-neutral payment-attempt snapshots and a
-- transactionally unique first-purchase discount claim. It does not activate
-- a payment provider or reinterpret historical payment outcomes.

BEGIN;

CREATE TYPE "DiscountKind" AS ENUM ('NONE', 'FIRST_PURCHASE');
CREATE TYPE "PaymentAttemptStatus" AS ENUM (
  'PREPARED',
  'PENDING',
  'RECONCILIATION_REQUIRED',
  'SUCCEEDED',
  'DEFINITIVELY_FAILED',
  'CANCELLED'
);
CREATE TYPE "DiscountClaimStatus" AS ENUM (
  'CLAIMED',
  'CONSUMED',
  'RELEASED'
);
CREATE TYPE "DiscountClaimReleaseReason" AS ENUM (
  'DEFINITIVE_PAYMENT_FAILED',
  'DEFINITIVE_PAYMENT_CANCELLED_UNPAID'
);

ALTER TABLE "Order"
  ADD COLUMN "discountKind" "DiscountKind" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountPolicyVersion" VARCHAR(64) NOT NULL DEFAULT 'no-discount-v1',
  ADD COLUMN "paymentAttemptId" UUID;

ALTER TABLE "Order" DROP CONSTRAINT "Order_amounts_check";
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_check" CHECK (
    "itemSubtotalMinor" >= 0
    AND "shippingMinor" = 500
    AND "discountMinor" BETWEEN 0 AND "itemSubtotalMinor"
    AND "totalMinor"::bigint =
      "itemSubtotalMinor"::bigint - "discountMinor"::bigint + "shippingMinor"::bigint
  ),
  ADD CONSTRAINT "Order_discount_policy_check" CHECK (
    (
      "discountKind" = 'NONE'
      AND "discountBasisPoints" = 0
      AND "discountMinor" = 0
      AND "discountPolicyVersion" = 'no-discount-v1'
    )
    OR
    (
      "discountKind" = 'FIRST_PURCHASE'
      AND "currency" = 'EUR'
      AND "discountBasisPoints" = 600
      AND "discountMinor"::bigint =
        (("itemSubtotalMinor"::bigint * 600 + 5000) / 10000)
      AND "discountPolicyVersion" = 'registered-first-purchase-v1'
      AND "paymentAttemptId" IS NOT NULL
    )
  );

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checkoutDraftId" UUID NOT NULL,
  "checkoutDraftVersion" INTEGER NOT NULL,
  "userId" UUID,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" BYTEA NOT NULL,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PREPARED',
  "currency" CHAR(3) NOT NULL,
  "itemSubtotalMinor" INTEGER NOT NULL,
  "discountKind" "DiscountKind" NOT NULL,
  "discountBasisPoints" INTEGER NOT NULL,
  "discountMinor" INTEGER NOT NULL,
  "discountPolicyVersion" VARCHAR(64) NOT NULL,
  "shippingMinor" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "quotedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "snapshotSealedAt" TIMESTAMP(3) WITH TIME ZONE,
  "email" VARCHAR(320) NOT NULL,
  "fullName" VARCHAR(200) NOT NULL,
  "phoneNumber" VARCHAR(32) NOT NULL,
  "countryCode" CHAR(2) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "street" VARCHAR(200) NOT NULL,
  "postalCode" VARCHAR(32),
  "administrativeArea" VARCHAR(120),
  "houseNumber" VARCHAR(32),
  "apartmentUnit" VARCHAR(64),
  "floor" VARCHAR(32),
  "additionalInfo" VARCHAR(500),
  "providerPaymentReference" VARCHAR(255),
  "pendingAt" TIMESTAMP(3) WITH TIME ZONE,
  "reconciliationRequiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "succeededAt" TIMESTAMP(3) WITH TIME ZONE,
  "definitivelyFailedAt" TIMESTAMP(3) WITH TIME ZONE,
  "cancelledAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttempt_requestHash_length_check" CHECK (
    octet_length("requestHash") = 32
  ),
  CONSTRAINT "PaymentAttempt_snapshot_check" CHECK (
    "checkoutDraftVersion" >= 1
    AND "currency" = 'EUR'
    AND "itemSubtotalMinor" >= 0
    AND "shippingMinor" = 500
    AND "discountMinor" BETWEEN 0 AND "itemSubtotalMinor"
    AND "totalMinor"::bigint =
      "itemSubtotalMinor"::bigint - "discountMinor"::bigint + "shippingMinor"::bigint
    AND (
      (
        "discountKind" = 'NONE'
        AND "discountBasisPoints" = 0
        AND "discountMinor" = 0
        AND "discountPolicyVersion" = 'no-discount-v1'
      )
      OR
      (
        "discountKind" = 'FIRST_PURCHASE'
        AND "userId" IS NOT NULL
        AND "discountBasisPoints" = 600
        AND "discountMinor"::bigint =
          (("itemSubtotalMinor"::bigint * 600 + 5000) / 10000)
        AND "discountPolicyVersion" = 'registered-first-purchase-v1'
      )
    )
  ),
  CONSTRAINT "PaymentAttempt_contact_check" CHECK (
    char_length("email") BETWEEN 3 AND 320
    AND "email" = btrim("email")
    AND char_length("fullName") BETWEEN 1 AND 200
    AND "fullName" = btrim("fullName")
    AND char_length("phoneNumber") BETWEEN 3 AND 32
    AND "phoneNumber" = btrim("phoneNumber")
    AND "countryCode" ~ '^[A-Z]{2}$'
    AND char_length("city") BETWEEN 1 AND 120
    AND "city" = btrim("city")
    AND char_length("street") BETWEEN 1 AND 200
    AND "street" = btrim("street")
  ),
  CONSTRAINT "PaymentAttempt_optional_delivery_check" CHECK (
    ("postalCode" IS NULL OR (char_length("postalCode") BETWEEN 1 AND 32 AND "postalCode" = btrim("postalCode")))
    AND ("administrativeArea" IS NULL OR (char_length("administrativeArea") BETWEEN 1 AND 120 AND "administrativeArea" = btrim("administrativeArea")))
    AND ("houseNumber" IS NULL OR (char_length("houseNumber") BETWEEN 1 AND 32 AND "houseNumber" = btrim("houseNumber")))
    AND ("apartmentUnit" IS NULL OR (char_length("apartmentUnit") BETWEEN 1 AND 64 AND "apartmentUnit" = btrim("apartmentUnit")))
    AND ("floor" IS NULL OR (char_length("floor") BETWEEN 1 AND 32 AND "floor" = btrim("floor")))
    AND ("additionalInfo" IS NULL OR (char_length("additionalInfo") BETWEEN 1 AND 500 AND "additionalInfo" = btrim("additionalInfo")))
    AND ("providerPaymentReference" IS NULL OR (char_length("providerPaymentReference") BETWEEN 1 AND 255 AND "providerPaymentReference" = btrim("providerPaymentReference")))
  ),
  CONSTRAINT "PaymentAttempt_bounded_country_policy_check" CHECK (
    (
      "countryCode" = 'DE'
      AND "postalCode" ~ '^[0-9]{5}$'
    )
    OR (
      "countryCode" = 'US'
      AND "postalCode" ~ '^[0-9]{5}(-[0-9]{4})?$'
      AND "administrativeArea" ~ '^[A-Z]{2}$'
    )
    OR "countryCode" NOT IN ('DE', 'US')
  ),
  CONSTRAINT "PaymentAttempt_lifecycle_check" CHECK (
    (
      "status" = 'PREPARED'
      AND "pendingAt" IS NULL
      AND "reconciliationRequiredAt" IS NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    )
    OR (
      "status" = 'PENDING'
      AND "snapshotSealedAt" IS NOT NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "pendingAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    )
    OR (
      "status" = 'RECONCILIATION_REQUIRED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "reconciliationRequiredAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    )
    OR (
      "status" = 'SUCCEEDED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "succeededAt" IS NOT NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    )
    OR (
      "status" = 'DEFINITIVELY_FAILED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NOT NULL
      AND "cancelledAt" IS NULL
    )
    OR (
      "status" = 'CANCELLED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NOT NULL
    )
  )
);

CREATE TABLE "PaymentAttemptItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentAttemptId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "productSlug" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "priceQualifier" VARCHAR(64) NOT NULL,
  "saleKind" "SaleKind" NOT NULL,
  "amountUnit" "AmountUnit" NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "priceBasisAmount" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentAttemptItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAttemptItem_amounts_check" CHECK (
    "priceMinor" >= 0
    AND "priceBasisAmount" BETWEEN 1 AND 2000000000
    AND "amount" BETWEEN 1 AND 2000000000
    AND "lineTotalMinor" >= 0
    AND "lineTotalMinor"::bigint =
      ((2 * "priceMinor"::bigint * "amount"::bigint + "priceBasisAmount"::bigint)
        / (2 * "priceBasisAmount"::bigint))
  ),
  CONSTRAINT "PaymentAttemptItem_snapshot_check" CHECK (
    char_length("productSlug") BETWEEN 1 AND 255
    AND char_length("productName") BETWEEN 1 AND 500
    AND char_length("priceQualifier") BETWEEN 1 AND 64
  )
);

CREATE TABLE "FirstPurchaseDiscountClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "paymentAttemptId" UUID NOT NULL,
  "status" "DiscountClaimStatus" NOT NULL DEFAULT 'CLAIMED',
  "heldAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "consumedOrderId" UUID,
  "releasedAt" TIMESTAMP(3) WITH TIME ZONE,
  "releaseReason" "DiscountClaimReleaseReason",
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "FirstPurchaseDiscountClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FirstPurchaseDiscountClaim_lifecycle_check" CHECK (
    (
      "status" = 'CLAIMED'
      AND "consumedAt" IS NULL
      AND "consumedOrderId" IS NULL
      AND "releasedAt" IS NULL
      AND "releaseReason" IS NULL
    )
    OR (
      "status" = 'CONSUMED'
      AND "consumedAt" IS NOT NULL
      AND "consumedOrderId" IS NOT NULL
      AND "releasedAt" IS NULL
      AND "releaseReason" IS NULL
    )
    OR (
      "status" = 'RELEASED'
      AND "consumedAt" IS NULL
      AND "consumedOrderId" IS NULL
      AND "releasedAt" IS NOT NULL
      AND "releaseReason" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "Order_paymentAttemptId_key"
  ON "Order"("paymentAttemptId");
CREATE UNIQUE INDEX "PaymentAttempt_providerPaymentReference_key"
  ON "PaymentAttempt"("providerPaymentReference");
CREATE UNIQUE INDEX "PaymentAttempt_draftId_idempotencyKey_key"
  ON "PaymentAttempt"("checkoutDraftId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentAttempt_id_userId_key"
  ON "PaymentAttempt"("id", "userId");
CREATE INDEX "PaymentAttempt_userId_status_createdAt_idx"
  ON "PaymentAttempt"("userId", "status", "createdAt");
CREATE INDEX "PaymentAttempt_status_updatedAt_idx"
  ON "PaymentAttempt"("status", "updatedAt");
CREATE UNIQUE INDEX "PaymentAttemptItem_attemptId_productId_key"
  ON "PaymentAttemptItem"("paymentAttemptId", "productId");
CREATE INDEX "PaymentAttemptItem_productId_idx"
  ON "PaymentAttemptItem"("productId");
CREATE UNIQUE INDEX "FirstPurchaseDiscountClaim_paymentAttemptId_key"
  ON "FirstPurchaseDiscountClaim"("paymentAttemptId");
CREATE UNIQUE INDEX "FirstPurchaseDiscountClaim_consumedOrderId_key"
  ON "FirstPurchaseDiscountClaim"("consumedOrderId");
CREATE UNIQUE INDEX "FirstPurchaseDiscountClaim_attemptId_userId_key"
  ON "FirstPurchaseDiscountClaim"("paymentAttemptId", "userId");
CREATE UNIQUE INDEX "FirstPurchaseDiscountClaim_one_active_or_consumed_per_user_key"
  ON "FirstPurchaseDiscountClaim"("userId")
  WHERE "status" IN ('CLAIMED', 'CONSUMED');
CREATE INDEX "FirstPurchaseDiscountClaim_userId_status_heldAt_idx"
  ON "FirstPurchaseDiscountClaim"("userId", "status", "heldAt");

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_checkoutDraftId_fkey"
  FOREIGN KEY ("checkoutDraftId") REFERENCES "CheckoutDraft"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttemptItem"
  ADD CONSTRAINT "PaymentAttemptItem_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentAttemptItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FirstPurchaseDiscountClaim"
  ADD CONSTRAINT "FirstPurchaseDiscountClaim_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FirstPurchaseDiscountClaim_attempt_user_fkey"
  FOREIGN KEY ("paymentAttemptId", "userId")
  REFERENCES "PaymentAttempt"("id", "userId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FirstPurchaseDiscountClaim"
  ADD CONSTRAINT "FirstPurchaseDiscountClaim_consumedOrderId_fkey"
  FOREIGN KEY ("consumedOrderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_payment_attempt_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."snapshotSealedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'PaymentAttempt snapshot seal must be established by guarded transition';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PaymentAttempt history cannot be deleted';
  END IF;
  IF OLD."providerPaymentReference" IS NOT NULL
    AND NEW."providerPaymentReference" IS DISTINCT FROM OLD."providerPaymentReference"
  THEN
    RAISE EXCEPTION 'PaymentAttempt provider reference cannot be changed once set';
  END IF;
  IF OLD."snapshotSealedAt" IS NOT NULL
    AND NEW."snapshotSealedAt" IS DISTINCT FROM OLD."snapshotSealedAt"
  THEN
    RAISE EXCEPTION 'PaymentAttempt snapshot seal cannot be changed once set';
  END IF;
  IF OLD."snapshotSealedAt" IS NULL AND NEW."snapshotSealedAt" IS NOT NULL THEN
    IF OLD."status" <> 'PREPARED' OR NEW."status" <> 'PREPARED' THEN
      RAISE EXCEPTION 'PaymentAttempt snapshot can only be sealed while prepared';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "PaymentAttemptItem"
      WHERE "paymentAttemptId" = OLD."id"
    ) OR (
      SELECT COALESCE(SUM("lineTotalMinor"::bigint), 0)
      FROM "PaymentAttemptItem"
      WHERE "paymentAttemptId" = OLD."id"
    ) <> NEW."itemSubtotalMinor"::bigint THEN
      RAISE EXCEPTION 'PaymentAttempt snapshot cannot be sealed without exact items';
    END IF;
  END IF;
  IF OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF OLD."snapshotSealedAt" IS NULL OR NEW."snapshotSealedAt" IS NULL THEN
      RAISE EXCEPTION 'Unsealed PaymentAttempt lifecycle cannot advance';
    END IF;
    IF NOT (
      (OLD."status" = 'PREPARED' AND NEW."status" IN (
        'PENDING', 'RECONCILIATION_REQUIRED', 'DEFINITIVELY_FAILED', 'CANCELLED'
      ))
      OR (OLD."status" = 'PENDING' AND NEW."status" IN (
        'RECONCILIATION_REQUIRED', 'SUCCEEDED', 'DEFINITIVELY_FAILED', 'CANCELLED'
      ))
      OR (OLD."status" = 'RECONCILIATION_REQUIRED' AND NEW."status" IN (
        'PENDING', 'SUCCEEDED', 'DEFINITIVELY_FAILED', 'CANCELLED'
      ))
    ) THEN
      RAISE EXCEPTION 'Illegal PaymentAttempt lifecycle transition';
    END IF;
  END IF;
  IF ROW(
    NEW."id", NEW."checkoutDraftId", NEW."checkoutDraftVersion", NEW."userId",
    NEW."idempotencyKey", NEW."requestHash", NEW."currency",
    NEW."itemSubtotalMinor", NEW."discountKind", NEW."discountBasisPoints",
    NEW."discountMinor", NEW."discountPolicyVersion", NEW."shippingMinor",
    NEW."totalMinor", NEW."quotedAt", NEW."email", NEW."fullName",
    NEW."phoneNumber", NEW."countryCode", NEW."city", NEW."street",
    NEW."postalCode", NEW."administrativeArea", NEW."houseNumber",
    NEW."apartmentUnit", NEW."floor", NEW."additionalInfo", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."checkoutDraftId", OLD."checkoutDraftVersion", OLD."userId",
    OLD."idempotencyKey", OLD."requestHash", OLD."currency",
    OLD."itemSubtotalMinor", OLD."discountKind", OLD."discountBasisPoints",
    OLD."discountMinor", OLD."discountPolicyVersion", OLD."shippingMinor",
    OLD."totalMinor", OLD."quotedAt", OLD."email", OLD."fullName",
    OLD."phoneNumber", OLD."countryCode", OLD."city", OLD."street",
    OLD."postalCode", OLD."administrativeArea", OLD."houseNumber",
    OLD."apartmentUnit", OLD."floor", OLD."additionalInfo", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'PaymentAttempt immutable snapshot cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_immutable_snapshot_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentAttempt"
  FOR EACH ROW EXECUTE FUNCTION reject_payment_attempt_snapshot_update();

CREATE FUNCTION require_payment_attempt_snapshot_sealed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PaymentAttempt"
    WHERE "id" = NEW."id" AND "snapshotSealedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'PaymentAttempt snapshot must be sealed before commit';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PaymentAttempt_sealed_before_commit_trigger"
  AFTER INSERT OR UPDATE ON "PaymentAttempt"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_payment_attempt_snapshot_sealed();

CREATE FUNCTION enforce_payment_attempt_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "PaymentAttemptStatus";
  attempt_sealed TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT "status", "snapshotSealedAt"
      INTO attempt_status, attempt_sealed
    FROM "PaymentAttempt"
    WHERE "id" = NEW."paymentAttemptId"
    FOR UPDATE;
    IF attempt_status = 'PREPARED' AND attempt_sealed IS NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PaymentAttemptItem cannot be added after snapshot seal';
  END IF;
  RAISE EXCEPTION 'PaymentAttemptItem immutable snapshot cannot be changed or deleted';
END;
$$;

CREATE TRIGGER "PaymentAttemptItem_immutable_write_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentAttemptItem"
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_attempt_item_snapshot();

CREATE FUNCTION enforce_first_purchase_claim_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "PaymentAttemptStatus";
  attempt_discount "DiscountKind";
  attempt_user UUID;
  attempt_sealed TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FirstPurchaseDiscountClaim history cannot be deleted';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT "status", "discountKind", "userId", "snapshotSealedAt"
      INTO attempt_status, attempt_discount, attempt_user, attempt_sealed
    FROM "PaymentAttempt"
    WHERE "id" = NEW."paymentAttemptId"
    FOR UPDATE;
    IF NEW."status" <> 'CLAIMED'
      OR attempt_status <> 'PREPARED'
      OR attempt_discount <> 'FIRST_PURCHASE'
      OR attempt_user IS DISTINCT FROM NEW."userId"
      OR attempt_sealed IS NULL
    THEN
      RAISE EXCEPTION 'FirstPurchaseDiscountClaim requires one sealed eligible attempt';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(NEW."id", NEW."userId", NEW."paymentAttemptId", NEW."heldAt", NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id", OLD."userId", OLD."paymentAttemptId", OLD."heldAt", OLD."createdAt")
  THEN
    RAISE EXCEPTION 'FirstPurchaseDiscountClaim identity cannot be changed';
  END IF;
  IF OLD."status" <> 'CLAIMED' THEN
    RAISE EXCEPTION 'Terminal FirstPurchaseDiscountClaim cannot be changed';
  END IF;
  IF NEW."status" = 'CLAIMED' THEN
    RETURN NEW;
  END IF;

  SELECT "status", "discountKind", "userId", "snapshotSealedAt"
    INTO attempt_status, attempt_discount, attempt_user, attempt_sealed
  FROM "PaymentAttempt"
  WHERE "id" = NEW."paymentAttemptId"
  FOR UPDATE;
  IF attempt_discount <> 'FIRST_PURCHASE'
    OR attempt_user IS DISTINCT FROM NEW."userId"
    OR attempt_sealed IS NULL
  THEN
    RAISE EXCEPTION 'FirstPurchaseDiscountClaim attempt invariant failed';
  END IF;

  IF NEW."status" = 'RELEASED' THEN
    IF NOT (
      (attempt_status = 'DEFINITIVELY_FAILED'
        AND NEW."releaseReason" = 'DEFINITIVE_PAYMENT_FAILED')
      OR (attempt_status = 'CANCELLED'
        AND NEW."releaseReason" = 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID')
    ) THEN
      RAISE EXCEPTION 'FirstPurchaseDiscountClaim cannot release before a definitive unpaid outcome';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = 'CONSUMED' THEN
    IF attempt_status <> 'SUCCEEDED' OR NOT EXISTS (
      SELECT 1
      FROM "Order"
      WHERE "id" = NEW."consumedOrderId"
        AND "paymentAttemptId" = NEW."paymentAttemptId"
        AND "userId" = NEW."userId"
        AND "paymentState" = 'PAID'
    ) THEN
      RAISE EXCEPTION 'FirstPurchaseDiscountClaim cannot consume without its successful paid order';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Illegal FirstPurchaseDiscountClaim lifecycle transition';
END;
$$;

CREATE TRIGGER "FirstPurchaseDiscountClaim_history_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "FirstPurchaseDiscountClaim"
  FOR EACH ROW EXECUTE FUNCTION enforce_first_purchase_claim_history();

CREATE FUNCTION assert_payment_attempt_claim_consistency(target_attempt_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "PaymentAttemptStatus";
  attempt_discount "DiscountKind";
  attempt_user UUID;
  claim_status "DiscountClaimStatus";
  claim_user UUID;
  claim_order UUID;
  claim_release_reason "DiscountClaimReleaseReason";
  claim_found BOOLEAN;
  matching_order UUID;
BEGIN
  SELECT "status", "discountKind", "userId"
    INTO attempt_status, attempt_discount, attempt_user
  FROM "PaymentAttempt"
  WHERE "id" = target_attempt_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "status", "userId", "consumedOrderId", "releaseReason"
    INTO claim_status, claim_user, claim_order, claim_release_reason
  FROM "FirstPurchaseDiscountClaim"
  WHERE "paymentAttemptId" = target_attempt_id;
  claim_found := FOUND;

  IF attempt_status = 'SUCCEEDED' THEN
    SELECT candidate_order."id"
      INTO matching_order
    FROM "Order" AS candidate_order
    JOIN "PaymentAttempt" AS successful_attempt
      ON successful_attempt."id" = target_attempt_id
    WHERE candidate_order."paymentAttemptId" = target_attempt_id
      AND candidate_order."paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND candidate_order."paymentState" = 'PAID'
      AND candidate_order."status" = 'PAID'
      AND candidate_order."paidAt" IS NOT NULL
      AND candidate_order."providerPaymentReference"
        = successful_attempt."providerPaymentReference"
      AND candidate_order."userId"
        IS NOT DISTINCT FROM successful_attempt."userId"
      AND candidate_order."currency" = successful_attempt."currency"
      AND candidate_order."itemSubtotalMinor"
        = successful_attempt."itemSubtotalMinor"
      AND candidate_order."discountKind" = successful_attempt."discountKind"
      AND candidate_order."discountBasisPoints"
        = successful_attempt."discountBasisPoints"
      AND candidate_order."discountMinor" = successful_attempt."discountMinor"
      AND candidate_order."discountPolicyVersion"
        = successful_attempt."discountPolicyVersion"
      AND candidate_order."shippingMinor" = successful_attempt."shippingMinor"
      AND candidate_order."totalMinor" = successful_attempt."totalMinor"
      AND NOT EXISTS (
        SELECT 1
        FROM "PaymentAttemptItem" AS attempt_item
        WHERE attempt_item."paymentAttemptId" = target_attempt_id
          AND NOT EXISTS (
            SELECT 1
            FROM "OrderItem" AS order_item
            WHERE order_item."orderId" = candidate_order."id"
              AND order_item."productId" = attempt_item."productId"
              AND order_item."productSlug" = attempt_item."productSlug"
              AND order_item."productName" = attempt_item."productName"
              AND order_item."priceQualifier" = attempt_item."priceQualifier"
              AND order_item."saleKind" = attempt_item."saleKind"
              AND order_item."amountUnit" = attempt_item."amountUnit"
              AND order_item."priceMinor" = attempt_item."priceMinor"
              AND order_item."priceBasisAmount" = attempt_item."priceBasisAmount"
              AND order_item."amount" = attempt_item."amount"
              AND order_item."lineTotalMinor" = attempt_item."lineTotalMinor"
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "OrderItem" AS order_item
        WHERE order_item."orderId" = candidate_order."id"
          AND NOT EXISTS (
            SELECT 1
            FROM "PaymentAttemptItem" AS attempt_item
            WHERE attempt_item."paymentAttemptId" = target_attempt_id
              AND attempt_item."productId" = order_item."productId"
              AND attempt_item."productSlug" = order_item."productSlug"
              AND attempt_item."productName" = order_item."productName"
              AND attempt_item."priceQualifier" = order_item."priceQualifier"
              AND attempt_item."saleKind" = order_item."saleKind"
              AND attempt_item."amountUnit" = order_item."amountUnit"
              AND attempt_item."priceMinor" = order_item."priceMinor"
              AND attempt_item."priceBasisAmount" = order_item."priceBasisAmount"
              AND attempt_item."amount" = order_item."amount"
              AND attempt_item."lineTotalMinor" = order_item."lineTotalMinor"
          )
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Successful PaymentAttempt requires its exact paid order';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "Order" WHERE "paymentAttemptId" = target_attempt_id
  ) THEN
    RAISE EXCEPTION 'Non-successful PaymentAttempt cannot retain a linked order';
  END IF;

  IF attempt_discount = 'NONE' THEN
    IF claim_found THEN
      RAISE EXCEPTION 'Non-discount PaymentAttempt cannot own a first-purchase claim';
    END IF;
    RETURN;
  END IF;

  IF NOT claim_found OR claim_user IS DISTINCT FROM attempt_user THEN
    RAISE EXCEPTION 'Discounted PaymentAttempt must own exactly one matching claim';
  END IF;

  IF attempt_status IN ('PREPARED', 'PENDING', 'RECONCILIATION_REQUIRED') THEN
    IF claim_status <> 'CLAIMED' THEN
      RAISE EXCEPTION 'Active PaymentAttempt must retain its claimed benefit';
    END IF;
    RETURN;
  END IF;

  IF attempt_status = 'SUCCEEDED' THEN
    IF claim_status <> 'CONSUMED'
      OR claim_order IS DISTINCT FROM matching_order
    THEN
      RAISE EXCEPTION 'Successful PaymentAttempt must consume its matching paid-order claim';
    END IF;
    RETURN;
  END IF;

  IF attempt_status = 'DEFINITIVELY_FAILED' THEN
    IF claim_status <> 'RELEASED'
      OR claim_release_reason <> 'DEFINITIVE_PAYMENT_FAILED'
    THEN
      RAISE EXCEPTION 'Definitively failed PaymentAttempt must release its claim';
    END IF;
    RETURN;
  END IF;

  IF attempt_status = 'CANCELLED' THEN
    IF claim_status <> 'RELEASED'
      OR claim_release_reason <> 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID'
    THEN
      RAISE EXCEPTION 'Cancelled unpaid PaymentAttempt must release its claim';
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unknown PaymentAttempt claim state';
END;
$$;

CREATE FUNCTION enforce_payment_attempt_claim_consistency_from_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_payment_attempt_claim_consistency(NEW."id");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PaymentAttempt_claim_consistency_trigger"
  AFTER INSERT OR UPDATE ON "PaymentAttempt"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_attempt_claim_consistency_from_attempt();

CREATE FUNCTION enforce_payment_attempt_claim_consistency_from_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_payment_attempt_claim_consistency(NEW."paymentAttemptId");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "FirstPurchaseDiscountClaim_attempt_consistency_trigger"
  AFTER INSERT OR UPDATE ON "FirstPurchaseDiscountClaim"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_attempt_claim_consistency_from_claim();

CREATE FUNCTION enforce_payment_attempt_consistency_from_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."paymentAttemptId" IS NOT NULL THEN
      PERFORM assert_payment_attempt_claim_consistency(OLD."paymentAttemptId");
    END IF;
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD."paymentAttemptId" IS NOT NULL
    AND OLD."paymentAttemptId" IS DISTINCT FROM NEW."paymentAttemptId"
  THEN
    PERFORM assert_payment_attempt_claim_consistency(OLD."paymentAttemptId");
  END IF;
  IF NEW."paymentAttemptId" IS NOT NULL THEN
    PERFORM assert_payment_attempt_claim_consistency(NEW."paymentAttemptId");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Order_payment_attempt_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "Order"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_attempt_consistency_from_order();

CREATE FUNCTION enforce_payment_attempt_consistency_from_order_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_attempt UUID;
  new_attempt UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "paymentAttemptId" INTO old_attempt
    FROM "Order"
    WHERE "id" = OLD."orderId";
    IF old_attempt IS NOT NULL THEN
      PERFORM assert_payment_attempt_claim_consistency(old_attempt);
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "paymentAttemptId" INTO new_attempt
    FROM "Order"
    WHERE "id" = NEW."orderId";
    IF new_attempt IS NOT NULL AND new_attempt IS DISTINCT FROM old_attempt THEN
      PERFORM assert_payment_attempt_claim_consistency(new_attempt);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OrderItem_payment_attempt_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_attempt_consistency_from_order_item();

COMMIT;
