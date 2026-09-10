-- O2G adds private pre-payment checkout drafts without rewriting orders,
-- carts, users, product stock, or historical order ownership.

BEGIN;

CREATE TYPE "CheckoutDraftStatus" AS ENUM ('PRE_PAYMENT');

CREATE TABLE "CheckoutDraft" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cartId" UUID NOT NULL,
  "userId" UUID,
  "guestCapabilityDigest" BYTEA,
  "guestCapabilityExpiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "status" "CheckoutDraftStatus" NOT NULL DEFAULT 'PRE_PAYMENT',
  "paymentMethod" "PaymentMethod" NOT NULL,
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
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,

  CONSTRAINT "CheckoutDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckoutDraft_owner_check" CHECK (
    (
      "userId" IS NOT NULL
      AND "guestCapabilityDigest" IS NULL
      AND "guestCapabilityExpiresAt" IS NULL
    )
    OR
    (
      "userId" IS NULL
      AND "guestCapabilityDigest" IS NOT NULL
      AND "guestCapabilityExpiresAt" IS NOT NULL
    )
  ),
  CONSTRAINT "CheckoutDraft_guestCapabilityDigest_length_check" CHECK (
    "guestCapabilityDigest" IS NULL
    OR octet_length("guestCapabilityDigest") = 32
  ),
  CONSTRAINT "CheckoutDraft_guestCapability_lifetime_check" CHECK (
    "guestCapabilityExpiresAt" IS NULL
    OR "guestCapabilityExpiresAt" = "createdAt" + interval '24 hours'
  ),
  CONSTRAINT "CheckoutDraft_countryCode_check" CHECK (
    "countryCode" ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT "CheckoutDraft_required_contact_check" CHECK (
    char_length("email") BETWEEN 3 AND 320
    AND "email" = btrim("email")
    AND char_length("fullName") BETWEEN 1 AND 200
    AND "fullName" = btrim("fullName")
    AND char_length("phoneNumber") BETWEEN 3 AND 32
    AND "phoneNumber" = btrim("phoneNumber")
    AND char_length("city") BETWEEN 1 AND 120
    AND "city" = btrim("city")
    AND char_length("street") BETWEEN 1 AND 200
    AND "street" = btrim("street")
  ),
  CONSTRAINT "CheckoutDraft_optional_delivery_check" CHECK (
    ("postalCode" IS NULL OR (char_length("postalCode") BETWEEN 1 AND 32 AND "postalCode" = btrim("postalCode")))
    AND ("administrativeArea" IS NULL OR (char_length("administrativeArea") BETWEEN 1 AND 120 AND "administrativeArea" = btrim("administrativeArea")))
    AND ("houseNumber" IS NULL OR (char_length("houseNumber") BETWEEN 1 AND 32 AND "houseNumber" = btrim("houseNumber")))
    AND ("apartmentUnit" IS NULL OR (char_length("apartmentUnit") BETWEEN 1 AND 64 AND "apartmentUnit" = btrim("apartmentUnit")))
    AND ("floor" IS NULL OR (char_length("floor") BETWEEN 1 AND 32 AND "floor" = btrim("floor")))
    AND ("additionalInfo" IS NULL OR (char_length("additionalInfo") BETWEEN 1 AND 500 AND "additionalInfo" = btrim("additionalInfo")))
  ),
  CONSTRAINT "CheckoutDraft_bounded_country_policy_check" CHECK (
    (
      "countryCode" = 'DE'
      AND "postalCode" ~ '^[0-9]{5}$'
    )
    OR
    (
      "countryCode" = 'US'
      AND "postalCode" ~ '^[0-9]{5}(-[0-9]{4})?$'
      AND "administrativeArea" ~ '^[A-Z]{2}$'
    )
    OR "countryCode" NOT IN ('DE', 'US')
  ),
  CONSTRAINT "CheckoutDraft_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "CheckoutDraftRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "checkoutDraftId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "requestHash" BYTEA NOT NULL,
  "responseSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CheckoutDraftRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckoutDraftRequest_requestHash_length_check" CHECK (
    octet_length("requestHash") = 32
  ),
  CONSTRAINT "CheckoutDraftRequest_responseSnapshot_object_check" CHECK (
    jsonb_typeof("responseSnapshot") = 'object'
  )
);

CREATE UNIQUE INDEX "CheckoutDraft_cartId_key"
  ON "CheckoutDraft"("cartId");
CREATE UNIQUE INDEX "CheckoutDraft_guestCapabilityDigest_key"
  ON "CheckoutDraft"("guestCapabilityDigest");
CREATE INDEX "CheckoutDraft_userId_status_updatedAt_idx"
  ON "CheckoutDraft"("userId", "status", "updatedAt");
CREATE INDEX "CheckoutDraft_guestCapabilityExpiresAt_idx"
  ON "CheckoutDraft"("guestCapabilityExpiresAt");
CREATE UNIQUE INDEX "CheckoutDraftRequest_draftId_idempotencyKey_key"
  ON "CheckoutDraftRequest"("checkoutDraftId", "idempotencyKey");
CREATE INDEX "CheckoutDraftRequest_createdAt_idx"
  ON "CheckoutDraftRequest"("createdAt");

ALTER TABLE "CheckoutDraft"
  ADD CONSTRAINT "CheckoutDraft_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckoutDraft"
  ADD CONSTRAINT "CheckoutDraft_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckoutDraftRequest"
  ADD CONSTRAINT "CheckoutDraftRequest_checkoutDraftId_fkey"
  FOREIGN KEY ("checkoutDraftId") REFERENCES "CheckoutDraft"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
