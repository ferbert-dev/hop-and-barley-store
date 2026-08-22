-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "normalizedEmail" VARCHAR(320) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_email_length_check" CHECK (char_length("email") BETWEEN 3 AND 320),
    CONSTRAINT "User_normalizedEmail_canonical_check" CHECK (
      char_length("normalizedEmail") BETWEEN 3 AND 320 AND
      "normalizedEmail" = lower("normalizedEmail") AND
      octet_length("normalizedEmail") = char_length("normalizedEmail") AND
      position('@' IN "normalizedEmail") > 1
    )
);

-- CreateTable
CREATE TABLE "PasswordCredential" (
    "userId" UUID NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "algorithm" VARCHAR(16) NOT NULL,
    "version" SMALLINT NOT NULL,
    "memoryCost" INTEGER NOT NULL,
    "timeCost" SMALLINT NOT NULL,
    "parallelism" SMALLINT NOT NULL,
    "hashLength" SMALLINT NOT NULL,
    "saltLength" SMALLINT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "PasswordCredential_algorithm_check" CHECK (
      "algorithm" = 'argon2id' AND
      "version" = 19 AND
      "memoryCost" = 65536 AND
      "timeCost" = 3 AND
      "parallelism" = 1 AND
      "hashLength" = 32 AND
      "saltLength" = 16
    ),
    CONSTRAINT "PasswordCredential_hash_format_check" CHECK (
      "passwordHash" ~ '^[$]argon2id[$]v=19[$]m=65536,p=1,t=3[$][A-Za-z0-9+/]+={0,2}[$][A-Za-z0-9+/]+={0,2}$'
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- AddForeignKey
ALTER TABLE "PasswordCredential"
  ADD CONSTRAINT "PasswordCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
