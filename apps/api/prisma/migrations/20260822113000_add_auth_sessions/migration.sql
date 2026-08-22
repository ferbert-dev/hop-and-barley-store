-- RetunePasswordCredentialProfile
-- A1B is a clean-start change: no production users exist. Fail closed instead
-- of silently rewriting or deleting an unexpected credential from A1.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PasswordCredential"
    WHERE "memoryCost" <> 7168
       OR "timeCost" <> 5
       OR "parallelism" <> 1
  ) THEN
    RAISE EXCEPTION 'A1B Argon2 profile migration found unsupported password credentials';
  END IF;
END
$$;

ALTER TABLE "PasswordCredential"
  DROP CONSTRAINT "PasswordCredential_algorithm_check",
  DROP CONSTRAINT "PasswordCredential_hash_format_check",
  ADD CONSTRAINT "PasswordCredential_algorithm_check" CHECK (
    "algorithm" = 'argon2id'
    AND "version" = 19
    AND "memoryCost" = 7168
    AND "timeCost" = 5
    AND "parallelism" = 1
    AND "hashLength" = 32
    AND "saltLength" = 16
  ),
  ADD CONSTRAINT "PasswordCredential_hash_format_check" CHECK (
    "passwordHash" ~ '^[$]argon2id[$]v=19[$]m=7168,p=1,t=5[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$'
  );

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" BYTEA NOT NULL,
    "userId" UUID NOT NULL,
    "roleAtIssue" "UserRole" NOT NULL,
    "credentialChangedAtAtIssue" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthSession_tokenHash_length_check" CHECK (octet_length("tokenHash") = 32),
    CONSTRAINT "AuthSession_absolute_lifetime_check" CHECK ("expiresAt" > "issuedAt"),
    CONSTRAINT "AuthSession_activity_window_check" CHECK (
      "lastSeenAt" >= "issuedAt" AND "lastSeenAt" <= "expiresAt"
    ),
    CONSTRAINT "AuthSession_revokedAt_check" CHECK (
      "revokedAt" IS NULL OR "revokedAt" >= "issuedAt"
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_active_idx"
  ON "AuthSession"("userId", "revokedAt", "expiresAt", "lastSeenAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
