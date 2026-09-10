-- O2P adds test-mode Stripe orchestration records without enabling live
-- payments. Payment attempts remain the immutable source of price, delivery,
-- ownership and product snapshots introduced by O2D.

BEGIN;

CREATE TYPE "PaymentAllocationStatus" AS ENUM (
  'ALLOCATED',
  'CAPTURE_REQUESTED',
  'RECONCILIATION_REQUIRED',
  'CAPTURED',
  'RELEASED'
);

CREATE TYPE "PaymentAllocationReleaseReason" AS ENUM (
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'AUTHORIZATION_EXPIRED',
  'STOCK_UNAVAILABLE'
);

CREATE TYPE "StripeWebhookDisposition" AS ENUM ('PROCESSED', 'IGNORED');

ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;

-- A cancelled, unpaid authorization remains immutable financial history, but
-- it must not prevent the same retained cart from starting a later attempt.
-- At most one non-cancelled order may still own the cart at a time.
DROP INDEX "Order_cartId_key";
CREATE UNIQUE INDEX "Order_cartId_active_key"
  ON "Order"("cartId") WHERE "status" <> 'CANCELLED';

ALTER TABLE "Order"
  DROP CONSTRAINT "Order_payment_outcome_check",
  ADD CONSTRAINT "Order_payment_outcome_check" CHECK (
    (
      "paymentMethod" = 'CASH_ON_DELIVERY'
      AND "paymentState" = 'DUE_ON_DELIVERY'
      AND "paidAt" IS NULL
      AND "providerPaymentReference" IS NULL
      AND "status" <> 'PAID'
    ) OR (
      "paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND "paymentState" = 'PENDING'
      AND "paidAt" IS NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "status" = 'PLACED'
    ) OR (
      "paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND "paymentState" = 'PAID'
      AND "paidAt" IS NOT NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "status" <> 'PLACED'
    ) OR (
      "paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND "paymentState" = 'FAILED'
      AND "paidAt" IS NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "status" = 'CANCELLED'
    )
  );

ALTER TABLE "PaymentAttempt"
  ADD COLUMN "providerSessionId" VARCHAR(255),
  ADD COLUMN "providerSessionExpiresAt" TIMESTAMP(3) WITH TIME ZONE,
  ADD CONSTRAINT "PaymentAttempt_provider_session_check" CHECK (
    (
      "providerSessionId" IS NULL
      AND "providerSessionExpiresAt" IS NULL
    ) OR (
      "providerSessionId" IS NOT NULL
      AND char_length("providerSessionId") BETWEEN 1 AND 255
      AND "providerSessionId" = btrim("providerSessionId")
      AND "providerSessionExpiresAt" IS NOT NULL
    )
  );

-- Hosted Checkout creates its PaymentIntent only after the customer submits
-- payment details. A pending attempt therefore starts with a durable Session
-- identity and receives its immutable PaymentIntent reference later.
ALTER TABLE "PaymentAttempt"
  DROP CONSTRAINT "PaymentAttempt_lifecycle_check",
  ADD CONSTRAINT "PaymentAttempt_lifecycle_check" CHECK (
    (
      "status" = 'PREPARED'
      AND "pendingAt" IS NULL
      AND "reconciliationRequiredAt" IS NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    ) OR (
      "status" = 'PENDING'
      AND "snapshotSealedAt" IS NOT NULL
      AND ("providerSessionId" IS NOT NULL OR "providerPaymentReference" IS NOT NULL)
      AND "pendingAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    ) OR (
      "status" = 'RECONCILIATION_REQUIRED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "reconciliationRequiredAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    ) OR (
      "status" = 'SUCCEEDED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "providerPaymentReference" IS NOT NULL
      AND "succeededAt" IS NOT NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NULL
    ) OR (
      "status" = 'DEFINITIVELY_FAILED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NOT NULL
      AND "cancelledAt" IS NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "snapshotSealedAt" IS NOT NULL
      AND "succeededAt" IS NULL
      AND "definitivelyFailedAt" IS NULL
      AND "cancelledAt" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "PaymentAttempt_providerSessionId_key"
  ON "PaymentAttempt"("providerSessionId");

CREATE TABLE "PaymentAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentAttemptId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "providerPaymentReference" VARCHAR(255) NOT NULL,
  "status" "PaymentAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
  "authorizedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "captureRequestedAt" TIMESTAMP(3) WITH TIME ZONE,
  "capturedAt" TIMESTAMP(3) WITH TIME ZONE,
  "releasedAt" TIMESTAMP(3) WITH TIME ZONE,
  "releaseReason" "PaymentAllocationReleaseReason",
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentAllocation_reference_check" CHECK (
    char_length("providerPaymentReference") BETWEEN 1 AND 255
    AND "providerPaymentReference" = btrim("providerPaymentReference")
  ),
  CONSTRAINT "PaymentAllocation_lifecycle_check" CHECK (
    (
      "status" = 'ALLOCATED'
      AND "captureRequestedAt" IS NULL
      AND "capturedAt" IS NULL
      AND "releasedAt" IS NULL
      AND "releaseReason" IS NULL
    ) OR (
      "status" IN ('CAPTURE_REQUESTED', 'RECONCILIATION_REQUIRED')
      AND "captureRequestedAt" IS NOT NULL
      AND "capturedAt" IS NULL
      AND "releasedAt" IS NULL
      AND "releaseReason" IS NULL
    ) OR (
      "status" = 'CAPTURED'
      AND "captureRequestedAt" IS NOT NULL
      AND "capturedAt" IS NOT NULL
      AND "releasedAt" IS NULL
      AND "releaseReason" IS NULL
    ) OR (
      "status" = 'RELEASED'
      AND "capturedAt" IS NULL
      AND "releasedAt" IS NOT NULL
      AND "releaseReason" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "PaymentAllocation_paymentAttemptId_key"
  ON "PaymentAllocation"("paymentAttemptId");
CREATE UNIQUE INDEX "PaymentAllocation_orderId_key"
  ON "PaymentAllocation"("orderId");
CREATE UNIQUE INDEX "PaymentAllocation_providerPaymentReference_key"
  ON "PaymentAllocation"("providerPaymentReference");
CREATE INDEX "PaymentAllocation_status_updatedAt_idx"
  ON "PaymentAllocation"("status", "updatedAt");

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StripeWebhookReceipt" (
  "providerEventId" VARCHAR(255) NOT NULL,
  "paymentAttemptId" UUID,
  "providerObjectId" VARCHAR(255) NOT NULL,
  "eventType" VARCHAR(120) NOT NULL,
  "livemode" BOOLEAN NOT NULL,
  "payloadHash" BYTEA NOT NULL,
  "providerCreatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "disposition" "StripeWebhookDisposition" NOT NULL,
  "receivedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "processedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "StripeWebhookReceipt_pkey" PRIMARY KEY ("providerEventId"),
  CONSTRAINT "StripeWebhookReceipt_identity_check" CHECK (
    char_length("providerEventId") BETWEEN 1 AND 255
    AND "providerEventId" = btrim("providerEventId")
    AND char_length("providerObjectId") BETWEEN 1 AND 255
    AND "providerObjectId" = btrim("providerObjectId")
    AND char_length("eventType") BETWEEN 1 AND 120
    AND "eventType" = btrim("eventType")
    AND octet_length("payloadHash") = 32
    AND "processedAt" >= "receivedAt"
  )
);

CREATE INDEX "StripeWebhookReceipt_attemptId_createdAt_idx"
  ON "StripeWebhookReceipt"("paymentAttemptId", "providerCreatedAt");
CREATE INDEX "StripeWebhookReceipt_type_createdAt_idx"
  ON "StripeWebhookReceipt"("eventType", "providerCreatedAt");

ALTER TABLE "StripeWebhookReceipt"
  ADD CONSTRAINT "StripeWebhookReceipt_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_stripe_payment_attempt_provider_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."providerSessionId" IS NOT NULL
    AND NEW."providerSessionId" IS DISTINCT FROM OLD."providerSessionId"
  THEN
    RAISE EXCEPTION 'PaymentAttempt provider session cannot be changed once set';
  END IF;
  IF OLD."providerSessionExpiresAt" IS NOT NULL
    AND NEW."providerSessionExpiresAt" IS DISTINCT FROM OLD."providerSessionExpiresAt"
  THEN
    RAISE EXCEPTION 'PaymentAttempt provider session expiry cannot be changed once set';
  END IF;
  IF OLD."providerSessionId" IS NULL AND NEW."providerSessionId" IS NOT NULL THEN
    IF NEW."status" <> 'PENDING'
      OR NEW."providerSessionExpiresAt" IS NULL
    THEN
      RAISE EXCEPTION 'PaymentAttempt provider session requires one pending attempt';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_stripe_provider_identity_trigger"
  BEFORE UPDATE ON "PaymentAttempt"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_stripe_payment_attempt_provider_identity();

CREATE FUNCTION enforce_payment_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PaymentAllocation history cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'ALLOCATED'
      OR NEW."captureRequestedAt" IS NOT NULL
      OR NEW."capturedAt" IS NOT NULL
      OR NEW."releasedAt" IS NOT NULL
      OR NEW."releaseReason" IS NOT NULL
    THEN
      RAISE EXCEPTION 'PaymentAllocation must begin allocated';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(
    NEW."id", NEW."paymentAttemptId", NEW."orderId", NEW."providerPaymentReference",
    NEW."authorizedAt", NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."id", OLD."paymentAttemptId", OLD."orderId", OLD."providerPaymentReference",
    OLD."authorizedAt", OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'PaymentAllocation identity cannot be changed';
  END IF;
  IF OLD."status" IN ('CAPTURED', 'RELEASED') THEN
    RAISE EXCEPTION 'Terminal PaymentAllocation cannot be changed';
  END IF;
  IF OLD."status" IS DISTINCT FROM NEW."status" AND NOT (
    (OLD."status" = 'ALLOCATED' AND NEW."status" IN (
      'CAPTURE_REQUESTED', 'RECONCILIATION_REQUIRED', 'RELEASED'
    ))
    OR (OLD."status" = 'CAPTURE_REQUESTED' AND NEW."status" IN (
      'CAPTURED', 'RECONCILIATION_REQUIRED', 'RELEASED'
    ))
    OR (OLD."status" = 'RECONCILIATION_REQUIRED' AND NEW."status" IN (
      'CAPTURE_REQUESTED', 'CAPTURED', 'RELEASED'
    ))
  ) THEN
    RAISE EXCEPTION 'Illegal PaymentAllocation lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAllocation_history_trigger"
  BEFORE INSERT OR UPDATE OR DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_allocation_history();

CREATE FUNCTION assert_payment_allocation_consistency(target_attempt_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "PaymentAttemptStatus";
  attempt_reference VARCHAR(255);
  allocation_status "PaymentAllocationStatus";
  allocation_reference VARCHAR(255);
  allocation_order_id UUID;
  allocation_found BOOLEAN;
  order_attempt_id UUID;
  order_payment_state "PaymentState";
  order_status "OrderStatus";
BEGIN
  SELECT "status", "providerPaymentReference"
    INTO attempt_status, attempt_reference
  FROM "PaymentAttempt"
  WHERE "id" = target_attempt_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "status", "providerPaymentReference", "orderId"
    INTO allocation_status, allocation_reference, allocation_order_id
  FROM "PaymentAllocation"
  WHERE "paymentAttemptId" = target_attempt_id;
  allocation_found := FOUND;

  IF NOT allocation_found THEN
    IF attempt_status = 'SUCCEEDED' THEN
      RAISE EXCEPTION 'Successful PaymentAttempt requires one captured allocation';
    END IF;
    RETURN;
  END IF;

  IF allocation_reference IS DISTINCT FROM attempt_reference THEN
    RAISE EXCEPTION 'PaymentAllocation provider reference must match its attempt';
  END IF;

  SELECT "paymentAttemptId", "paymentState", "status"
    INTO order_attempt_id, order_payment_state, order_status
  FROM "Order"
  WHERE "id" = allocation_order_id;
  IF NOT FOUND OR order_attempt_id IS DISTINCT FROM target_attempt_id THEN
    RAISE EXCEPTION 'PaymentAllocation requires its exact attempt-owned order';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Order" AS candidate_order
    JOIN "PaymentAttempt" AS candidate_attempt
      ON candidate_attempt."id" = target_attempt_id
    WHERE candidate_order."id" = allocation_order_id
      AND candidate_order."paymentAttemptId" = target_attempt_id
      AND candidate_order."paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND candidate_order."providerPaymentReference" = candidate_attempt."providerPaymentReference"
      AND candidate_order."userId" IS NOT DISTINCT FROM candidate_attempt."userId"
      AND candidate_order."currency" = candidate_attempt."currency"
      AND candidate_order."itemSubtotalMinor" = candidate_attempt."itemSubtotalMinor"
      AND candidate_order."discountKind" = candidate_attempt."discountKind"
      AND candidate_order."discountBasisPoints" = candidate_attempt."discountBasisPoints"
      AND candidate_order."discountMinor" = candidate_attempt."discountMinor"
      AND candidate_order."discountPolicyVersion" = candidate_attempt."discountPolicyVersion"
      AND candidate_order."shippingMinor" = candidate_attempt."shippingMinor"
      AND candidate_order."totalMinor" = candidate_attempt."totalMinor"
      AND NOT EXISTS (
        SELECT 1 FROM "PaymentAttemptItem" AS attempt_item
        WHERE attempt_item."paymentAttemptId" = target_attempt_id
          AND NOT EXISTS (
            SELECT 1 FROM "OrderItem" AS order_item
            WHERE order_item."orderId" = candidate_order."id"
              AND ROW(
                order_item."productId", order_item."productSlug", order_item."productName",
                order_item."priceQualifier", order_item."saleKind", order_item."amountUnit",
                order_item."priceMinor", order_item."priceBasisAmount", order_item."amount",
                order_item."lineTotalMinor"
              ) = ROW(
                attempt_item."productId", attempt_item."productSlug", attempt_item."productName",
                attempt_item."priceQualifier", attempt_item."saleKind", attempt_item."amountUnit",
                attempt_item."priceMinor", attempt_item."priceBasisAmount", attempt_item."amount",
                attempt_item."lineTotalMinor"
              )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "OrderItem" AS order_item
        WHERE order_item."orderId" = candidate_order."id"
          AND NOT EXISTS (
            SELECT 1 FROM "PaymentAttemptItem" AS attempt_item
            WHERE attempt_item."paymentAttemptId" = target_attempt_id
              AND ROW(
                attempt_item."productId", attempt_item."productSlug", attempt_item."productName",
                attempt_item."priceQualifier", attempt_item."saleKind", attempt_item."amountUnit",
                attempt_item."priceMinor", attempt_item."priceBasisAmount", attempt_item."amount",
                attempt_item."lineTotalMinor"
              ) = ROW(
                order_item."productId", order_item."productSlug", order_item."productName",
                order_item."priceQualifier", order_item."saleKind", order_item."amountUnit",
                order_item."priceMinor", order_item."priceBasisAmount", order_item."amount",
                order_item."lineTotalMinor"
              )
          )
      )
  ) THEN
    RAISE EXCEPTION 'PaymentAllocation requires its exact immutable order snapshot';
  END IF;

  IF allocation_status IN (
    'ALLOCATED', 'CAPTURE_REQUESTED', 'RECONCILIATION_REQUIRED'
  ) THEN
    IF attempt_status NOT IN ('PENDING', 'RECONCILIATION_REQUIRED') THEN
      RAISE EXCEPTION 'Active PaymentAllocation requires an active attempt';
    END IF;
    IF order_payment_state <> 'PENDING' OR order_status <> 'PLACED' THEN
      RAISE EXCEPTION 'Active PaymentAllocation requires one pending order';
    END IF;
    RETURN;
  END IF;

  IF allocation_status = 'CAPTURED' THEN
    IF attempt_status <> 'SUCCEEDED' THEN
      RAISE EXCEPTION 'Captured PaymentAllocation requires a successful attempt';
    END IF;
    IF order_payment_state <> 'PAID' OR order_status <> 'PAID' THEN
      RAISE EXCEPTION 'Captured PaymentAllocation requires one paid order';
    END IF;
    RETURN;
  END IF;

  IF allocation_status = 'RELEASED' THEN
    IF attempt_status NOT IN ('DEFINITIVELY_FAILED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Released PaymentAllocation requires a definitive unpaid attempt';
    END IF;
    IF order_payment_state <> 'FAILED' OR order_status <> 'CANCELLED' THEN
      RAISE EXCEPTION 'Released PaymentAllocation requires one cancelled unpaid order';
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Unknown PaymentAllocation state';
END;
$$;

CREATE FUNCTION enforce_payment_allocation_consistency_from_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_payment_allocation_consistency(NEW."paymentAttemptId");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PaymentAllocation_attempt_consistency_trigger"
  AFTER INSERT OR UPDATE ON "PaymentAllocation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_allocation_consistency_from_allocation();

CREATE FUNCTION enforce_payment_allocation_consistency_from_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_payment_allocation_consistency(NEW."id");
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "PaymentAttempt_allocation_consistency_trigger"
  AFTER UPDATE ON "PaymentAttempt"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_allocation_consistency_from_attempt();

CREATE FUNCTION enforce_payment_allocation_consistency_from_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."paymentAttemptId" IS NOT NULL THEN
    PERFORM assert_payment_allocation_consistency(NEW."paymentAttemptId");
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Order_allocation_consistency_trigger"
  AFTER INSERT OR UPDATE ON "Order"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_allocation_consistency_from_order();

CREATE FUNCTION enforce_payment_allocation_consistency_from_order_item()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_order_id UUID;
  target_attempt_id UUID;
BEGIN
  target_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."orderId" ELSE NEW."orderId" END;
  SELECT "paymentAttemptId" INTO target_attempt_id
  FROM "Order" WHERE "id" = target_order_id;
  IF target_attempt_id IS NOT NULL THEN
    PERFORM assert_payment_allocation_consistency(target_attempt_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OrderItem_allocation_consistency_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "OrderItem"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_allocation_consistency_from_order_item();

-- O2D originally prohibited any linked Order until success. O2P replaces that
-- assertion so an exact pending Order can be committed atomically with stock
-- allocation before capture, while retaining the exact paid-order guarantee.
CREATE OR REPLACE FUNCTION assert_payment_attempt_claim_consistency(target_attempt_id UUID)
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
  IF NOT FOUND THEN RETURN; END IF;

  SELECT "status", "userId", "consumedOrderId", "releaseReason"
    INTO claim_status, claim_user, claim_order, claim_release_reason
  FROM "FirstPurchaseDiscountClaim"
  WHERE "paymentAttemptId" = target_attempt_id;
  claim_found := FOUND;

  IF attempt_status = 'SUCCEEDED' THEN
    SELECT candidate_order."id" INTO matching_order
    FROM "Order" AS candidate_order
    JOIN "PaymentAttempt" AS successful_attempt
      ON successful_attempt."id" = target_attempt_id
    WHERE candidate_order."paymentAttemptId" = target_attempt_id
      AND candidate_order."paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND candidate_order."paymentState" = 'PAID'
      AND candidate_order."status" = 'PAID'
      AND candidate_order."paidAt" IS NOT NULL
      AND candidate_order."providerPaymentReference" = successful_attempt."providerPaymentReference"
      AND candidate_order."userId" IS NOT DISTINCT FROM successful_attempt."userId"
      AND candidate_order."currency" = successful_attempt."currency"
      AND candidate_order."itemSubtotalMinor" = successful_attempt."itemSubtotalMinor"
      AND candidate_order."discountKind" = successful_attempt."discountKind"
      AND candidate_order."discountBasisPoints" = successful_attempt."discountBasisPoints"
      AND candidate_order."discountMinor" = successful_attempt."discountMinor"
      AND candidate_order."discountPolicyVersion" = successful_attempt."discountPolicyVersion"
      AND candidate_order."shippingMinor" = successful_attempt."shippingMinor"
      AND candidate_order."totalMinor" = successful_attempt."totalMinor"
      AND NOT EXISTS (
        SELECT 1 FROM "PaymentAttemptItem" AS attempt_item
        WHERE attempt_item."paymentAttemptId" = target_attempt_id
          AND NOT EXISTS (
            SELECT 1 FROM "OrderItem" AS order_item
            WHERE order_item."orderId" = candidate_order."id"
              AND ROW(
                order_item."productId", order_item."productSlug", order_item."productName",
                order_item."priceQualifier", order_item."saleKind", order_item."amountUnit",
                order_item."priceMinor", order_item."priceBasisAmount", order_item."amount",
                order_item."lineTotalMinor"
              ) = ROW(
                attempt_item."productId", attempt_item."productSlug", attempt_item."productName",
                attempt_item."priceQualifier", attempt_item."saleKind", attempt_item."amountUnit",
                attempt_item."priceMinor", attempt_item."priceBasisAmount", attempt_item."amount",
                attempt_item."lineTotalMinor"
              )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM "OrderItem" AS order_item
        WHERE order_item."orderId" = candidate_order."id"
          AND NOT EXISTS (
            SELECT 1 FROM "PaymentAttemptItem" AS attempt_item
            WHERE attempt_item."paymentAttemptId" = target_attempt_id
              AND ROW(
                attempt_item."productId", attempt_item."productSlug", attempt_item."productName",
                attempt_item."priceQualifier", attempt_item."saleKind", attempt_item."amountUnit",
                attempt_item."priceMinor", attempt_item."priceBasisAmount", attempt_item."amount",
                attempt_item."lineTotalMinor"
              ) = ROW(
                order_item."productId", order_item."productSlug", order_item."productName",
                order_item."priceQualifier", order_item."saleKind", order_item."amountUnit",
                order_item."priceMinor", order_item."priceBasisAmount", order_item."amount",
                order_item."lineTotalMinor"
              )
          )
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Successful PaymentAttempt requires its exact paid order';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "Order" WHERE "paymentAttemptId" = target_attempt_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM "Order" AS candidate_order
    JOIN "PaymentAllocation" AS allocation
      ON allocation."orderId" = candidate_order."id"
      AND allocation."paymentAttemptId" = target_attempt_id
    WHERE candidate_order."paymentAttemptId" = target_attempt_id
      AND (
        (
          attempt_status IN ('PENDING', 'RECONCILIATION_REQUIRED')
          AND candidate_order."paymentState" = 'PENDING'
          AND candidate_order."status" = 'PLACED'
        ) OR (
          attempt_status IN ('DEFINITIVELY_FAILED', 'CANCELLED')
          AND candidate_order."paymentState" = 'FAILED'
          AND candidate_order."status" = 'CANCELLED'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Non-successful PaymentAttempt has an invalid linked order';
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
    IF claim_status <> 'CONSUMED' OR claim_order IS DISTINCT FROM matching_order THEN
      RAISE EXCEPTION 'Successful PaymentAttempt must consume its matching paid-order claim';
    END IF;
    RETURN;
  END IF;
  IF attempt_status = 'DEFINITIVELY_FAILED' THEN
    IF claim_status <> 'RELEASED' OR claim_release_reason <> 'DEFINITIVE_PAYMENT_FAILED' THEN
      RAISE EXCEPTION 'Definitively failed PaymentAttempt must release its claim';
    END IF;
    RETURN;
  END IF;
  IF attempt_status = 'CANCELLED' THEN
    IF claim_status <> 'RELEASED' OR claim_release_reason <> 'DEFINITIVE_PAYMENT_CANCELLED_UNPAID' THEN
      RAISE EXCEPTION 'Cancelled unpaid PaymentAttempt must release its claim';
    END IF;
    RETURN;
  END IF;
  RAISE EXCEPTION 'Unknown PaymentAttempt claim state';
END;
$$;

CREATE FUNCTION reject_stripe_webhook_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'StripeWebhookReceipt history cannot be changed or deleted';
END;
$$;

CREATE TRIGGER "StripeWebhookReceipt_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "StripeWebhookReceipt"
  FOR EACH ROW EXECUTE FUNCTION reject_stripe_webhook_receipt_mutation();

COMMIT;
