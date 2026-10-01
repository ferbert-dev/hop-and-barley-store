-- O3L records one public Like for one fully server-confirmed Stripe Sandbox
-- purchase. The table deliberately stores only immutable payment/order IDs;
-- all customer data remains in its private source records.

BEGIN;

CREATE TABLE "PurchaseLike" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paymentAttemptId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PurchaseLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseLike_paymentAttemptId_key"
  ON "PurchaseLike"("paymentAttemptId");
CREATE UNIQUE INDEX "PurchaseLike_orderId_key" ON "PurchaseLike"("orderId");

ALTER TABLE "PurchaseLike"
  ADD CONSTRAINT "PurchaseLike_paymentAttemptId_fkey"
  FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PurchaseLike_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application checks are not sufficient for an earned action: a direct write
-- must also prove the exact paid Stripe order and successful attempt pair.
CREATE FUNCTION enforce_purchase_like_eligible_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "PaymentAttempt" AS attempt
    JOIN "Order" AS purchase
      ON purchase."id" = NEW."orderId"
      AND purchase."paymentAttemptId" = attempt."id"
    WHERE attempt."id" = NEW."paymentAttemptId"
      AND attempt."status" = 'SUCCEEDED'
      AND purchase."paymentMethod" = 'STRIPE_DEBIT_CARD'
      AND purchase."paymentState" = 'PAID'
      AND purchase."status" = 'PAID'
      AND purchase."providerPaymentReference" = attempt."providerPaymentReference"
  ) THEN
    RAISE EXCEPTION 'PurchaseLike requires its exact successful paid Stripe Sandbox order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PurchaseLike_eligible_payment_trigger"
  BEFORE INSERT OR UPDATE OF "paymentAttemptId", "orderId" ON "PurchaseLike"
  FOR EACH ROW EXECUTE FUNCTION enforce_purchase_like_eligible_payment();

COMMIT;
