-- A4 is additive. Existing users, credentials, sessions and orders are
-- preserved; profile and primary-address rows remain optional.

BEGIN;

CREATE TABLE "CustomerProfile" (
  "userId" UUID NOT NULL,
  "fullName" VARCHAR(200),
  "phone" VARCHAR(32),
  "avatarData" BYTEA,
  "avatarContentType" VARCHAR(32),
  "avatarSizeBytes" INTEGER,
  "avatarUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "CustomerProfile_avatar_check" CHECK (
    (
      "avatarData" IS NULL
      AND "avatarContentType" IS NULL
      AND "avatarSizeBytes" IS NULL
      AND "avatarUpdatedAt" IS NULL
    )
    OR
    (
      "avatarData" IS NOT NULL
      AND "avatarContentType" IN ('image/jpeg', 'image/png', 'image/webp')
      AND "avatarSizeBytes" = octet_length("avatarData")
      AND "avatarSizeBytes" BETWEEN 1 AND 2097152
      AND "avatarUpdatedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "PrimaryAddress" (
  "userId" UUID NOT NULL,
  "country" VARCHAR(120),
  "city" VARCHAR(120),
  "postalCode" VARCHAR(32),
  "street" VARCHAR(200),
  "houseNumber" VARCHAR(32),
  "apartmentUnit" VARCHAR(64),
  "floor" VARCHAR(32),
  "additionalInfo" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PrimaryAddress_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrimaryAddress"
  ADD CONSTRAINT "PrimaryAddress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
