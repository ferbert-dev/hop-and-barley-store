#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o3l-postgres-${$}"
database_user='hopbarley_o3l'
database_password='hopbarley_o3l_fixture'
migration_name='20260929090000_add_purchase_likes'
migration_path="$repo_root/apps/api/prisma/migrations/$migration_name/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O3L container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT INT TERM

docker run --rm --detach --name "$container_name" \
  --memory 1g --memory-swap 1g \
  --env POSTGRES_DB=fresh_o3l --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null
test "$(docker inspect --format '{{.HostConfig.Memory}}:{{.HostConfig.MemorySwap}}' "$container_name")" = \
  '1073741824:1073741824'

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | \
    grep -c 'database system is ready to accept connections' || true)
  if ((ready_count >= 2)); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready --username "$database_user" --dbname fresh_o3l >/dev/null
database_port=$(docker port "$container_name" 5432/tcp)
database_port=${database_port##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
}

query_scalar() {
  docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$1" \
    --command "$2"
}

apply_prior_migrations() {
  local database_name=$1
  local directory
  for directory in "$repo_root"/apps/api/prisma/migrations/*; do
    if test "$(basename "$directory")" = "$migration_name"; then break; fi
    if test -f "$directory/migration.sql"; then
      docker exec --interactive "$container_name" psql --no-psqlrc \
        --set ON_ERROR_STOP=1 --username "$database_user" \
        --dbname "$database_name" < "$directory/migration.sql" >/dev/null
    fi
  done
}

expect_like_rejection() {
  local label=$1
  local payment_attempt_id=$2
  local order_id=$3
  local output

  if output=$(docker exec "$container_name" psql --no-psqlrc \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname fresh_o3l \
    --command "INSERT INTO \"PurchaseLike\" (\"paymentAttemptId\", \"orderId\") VALUES ('$payment_attempt_id', '$order_id');" 2>&1); then
    echo "Expected PurchaseLike trigger to reject $label" >&2
    exit 1
  fi
  if [[ "$output" != *'PurchaseLike requires its exact successful paid Stripe Sandbox order'* ]]; then
    echo "PurchaseLike $label failed for an unexpected reason" >&2
    exit 1
  fi
  test "$(query_scalar fresh_o3l 'SELECT count(*) FROM "PurchaseLike";')" = '0'
}

# Prove the committed migration is atomic on an upgrade-shaped database. The
# injected error is inside its BEGIN/COMMIT block; no O3L object may survive.
docker exec "$container_name" createdb -U "$database_user" atomic_o3l
apply_prior_migrations atomic_o3l
if awk '/^COMMIT;$/ { print "SELECT 1 / 0;" } { print }' "$migration_path" | \
  docker exec --interactive "$container_name" psql --no-psqlrc \
    --set ON_ERROR_STOP=1 --username "$database_user" \
    --dbname atomic_o3l >/dev/null 2>&1; then
  echo 'Expected injected O3L migration failure' >&2
  exit 1
fi
atomic_shape=$(query_scalar atomic_o3l "
  SELECT
    to_regclass('public.\"PaymentAttempt\"') IS NOT NULL,
    to_regclass('public.\"Order\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike\"') IS NULL,
    to_regclass('public.\"PurchaseLike_paymentAttemptId_key\"') IS NULL,
    to_regclass('public.\"PurchaseLike_orderId_key\"') IS NULL,
    NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'PurchaseLike_eligible_payment_trigger'
    ),
    to_regprocedure('enforce_purchase_like_eligible_payment()') IS NULL;
")
test "$atomic_shape" = 't|t|t|t|t|t|t'
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" \
  --dbname atomic_o3l < "$migration_path" >/dev/null
recovered_shape=$(query_scalar atomic_o3l "
  SELECT
    to_regclass('public.\"PurchaseLike\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike_paymentAttemptId_key\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike_orderId_key\"') IS NOT NULL,
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'PurchaseLike_eligible_payment_trigger' AND NOT tgisinternal
    ),
    to_regprocedure('enforce_purchase_like_eligible_payment()') IS NOT NULL;
")
test "$recovered_shape" = 't|t|t|t|t'

fresh_url=$(database_url fresh_o3l)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed >/dev/null

first_seed_shape=$(query_scalar fresh_o3l "
  SELECT
    (SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
    (SELECT count(*) FROM \"Category\"),
    (SELECT count(*) FROM \"Product\"),
    (SELECT md5(string_agg(\"id\"::text || ':' || \"slug\", ',' ORDER BY \"slug\")) FROM \"Product\");
")
expected_migration_count=0
for directory in "$repo_root"/apps/api/prisma/migrations/*; do
  if test -f "$directory/migration.sql"; then
    ((expected_migration_count += 1))
  fi
done
IFS='|' read -r first_migration_count first_category_count first_product_count first_product_hash <<< "$first_seed_shape"
test "$first_migration_count" = "$expected_migration_count"
test "$first_category_count" = '5'
test "$first_product_count" = '12'
test -n "$first_product_hash"
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l \
  --command 'UPDATE "Product" SET "stockAmount" = 7 WHERE "slug" = '\''safale-us05-yeast'\'';' >/dev/null
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed >/dev/null
second_seed_shape=$(query_scalar fresh_o3l "
  SELECT
    (SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
    (SELECT count(*) FROM \"Category\"),
    (SELECT count(*) FROM \"Product\"),
    (SELECT md5(string_agg(\"id\"::text || ':' || \"slug\", ',' ORDER BY \"slug\")) FROM \"Product\");
")
test "$first_seed_shape" = "$second_seed_shape"
test "$(query_scalar fresh_o3l 'SELECT "stockAmount" FROM "Product" WHERE "slug" = '\''safale-us05-yeast'\'';')" = '7'

shape=$(docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
  --username "$database_user" --dbname fresh_o3l --command "
  SELECT to_regclass('public.\"PurchaseLike\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike_paymentAttemptId_key\"') IS NOT NULL,
    to_regclass('public.\"PurchaseLike_orderId_key\"') IS NOT NULL,
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'PurchaseLike_eligible_payment_trigger' AND NOT tgisinternal),
    to_regprocedure('enforce_purchase_like_eligible_payment()') IS NOT NULL;")
test "$shape" = 't|t|t|t|t'

# Create two individually valid pairs while suppressing older payment-history
# constraint triggers. Re-enable normal trigger execution before testing O3L.
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname fresh_o3l >/dev/null <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica;

INSERT INTO "Cart" ("id", "tokenDigest", "expiresAt", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000101', decode(repeat('01', 32), 'hex'), CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000102', decode(repeat('02', 32), 'hex'), CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP);

INSERT INTO "CheckoutDraft" (
  "id", "cartId", "guestCapabilityDigest", "guestCapabilityExpiresAt",
  "paymentMethod", "email", "fullName", "phoneNumber", "countryCode",
  "city", "street", "postalCode", "createdAt", "updatedAt"
) VALUES
  (
    '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
    decode(repeat('11', 32), 'hex'), CURRENT_TIMESTAMP + interval '24 hours',
    'STRIPE_DEBIT_CARD', 'o3l-one@example.test', 'O3L One', '+49 30 111111',
    'DE', 'Berlin', 'O3L Street 1', '10115', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102',
    decode(repeat('12', 32), 'hex'), CURRENT_TIMESTAMP + interval '24 hours',
    'STRIPE_DEBIT_CARD', 'o3l-two@example.test', 'O3L Two', '+49 30 222222',
    'DE', 'Berlin', 'O3L Street 2', '10115', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO "PaymentAttempt" (
  "id", "checkoutDraftId", "checkoutDraftVersion", "idempotencyKey",
  "requestHash", "status", "currency", "itemSubtotalMinor", "discountKind",
  "discountBasisPoints", "discountMinor", "discountPolicyVersion",
  "shippingMinor", "totalMinor", "quotedAt", "snapshotSealedAt", "email",
  "fullName", "phoneNumber", "countryCode", "city", "street", "postalCode",
  "providerPaymentReference", "succeededAt", "updatedAt"
) VALUES
  (
    '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 1,
    'o3l-trigger-fixture-1', decode(repeat('21', 32), 'hex'), 'SUCCEEDED', 'EUR',
    1000, 'NONE', 0, 0, 'no-discount-v1', 500, 1500, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, 'o3l-one@example.test', 'O3L One', '+49 30 111111',
    'DE', 'Berlin', 'O3L Street 1', '10115', 'pi_o3l_fixture_1',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 1,
    'o3l-trigger-fixture-2', decode(repeat('22', 32), 'hex'), 'SUCCEEDED', 'EUR',
    1000, 'NONE', 0, 0, 'no-discount-v1', 500, 1500, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, 'o3l-two@example.test', 'O3L Two', '+49 30 222222',
    'DE', 'Berlin', 'O3L Street 2', '10115', 'pi_o3l_fixture_2',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO "Order" (
  "id", "cartId", "idempotencyKey", "requestHash", "status",
  "paymentMethod", "paymentState", "providerPaymentReference", "currency",
  "itemSubtotalMinor", "shippingMinor", "totalMinor", "paymentAttemptId",
  "fullName", "phoneNumber", "city", "shippingAddress", "placedAt", "paidAt",
  "updatedAt"
) VALUES
  (
    '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101',
    'o3l-order-fixture-1', decode(repeat('31', 32), 'hex'), 'PAID',
    'STRIPE_DEBIT_CARD', 'PAID', 'pi_o3l_fixture_1', 'EUR', 1000, 500, 1500,
    '00000000-0000-4000-8000-000000000301', 'O3L One', '+49 30 111111',
    'Berlin', 'O3L Street 1, 10115 Berlin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000102',
    'o3l-order-fixture-2', decode(repeat('32', 32), 'hex'), 'PAID',
    'STRIPE_DEBIT_CARD', 'PAID', 'pi_o3l_fixture_2', 'EUR', 1000, 500, 1500,
    '00000000-0000-4000-8000-000000000302', 'O3L Two', '+49 30 222222',
    'Berlin', 'O3L Street 2, 10115 Berlin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
COMMIT;
SQL

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'INSERT INTO "PurchaseLike" ("paymentAttemptId", "orderId") VALUES ('\''00000000-0000-4000-8000-000000000301'\'', '\''00000000-0000-4000-8000-000000000401'\''); DELETE FROM "PurchaseLike";' >/dev/null

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "PaymentAttempt" SET "status" = '\''DEFINITIVELY_FAILED'\'', "succeededAt" = NULL, "definitivelyFailedAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000301'\'';' >/dev/null
expect_like_rejection 'definitively failed attempt' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "PaymentAttempt" SET "status" = '\''CANCELLED'\'', "definitivelyFailedAt" = NULL, "cancelledAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000301'\'';' >/dev/null
expect_like_rejection 'cancelled attempt' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "PaymentAttempt" SET "status" = '\''RECONCILIATION_REQUIRED'\'', "cancelledAt" = NULL, "reconciliationRequiredAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000301'\'';' >/dev/null
expect_like_rejection 'unknown reconciliation-required attempt' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "PaymentAttempt" SET "status" = '\''SUCCEEDED'\'', "reconciliationRequiredAt" = NULL, "succeededAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000301'\'';' >/dev/null

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''CANCELLED'\'', "paymentMethod" = '\''STRIPE_DEBIT_CARD'\'', "paymentState" = '\''FAILED'\'', "providerPaymentReference" = '\''pi_o3l_fixture_1'\'', "paidAt" = NULL WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null
expect_like_rejection 'failed Stripe order' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''PAID'\'', "paymentState" = '\''PAID'\'', "paidAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''PLACED'\'', "paymentState" = '\''PENDING'\'', "paidAt" = NULL WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null
expect_like_rejection 'pending unknown Stripe order' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''PAID'\'', "paymentState" = '\''PAID'\'', "paidAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''PLACED'\'', "paymentMethod" = '\''CASH_ON_DELIVERY'\'', "paymentState" = '\''DUE_ON_DELIVERY'\'', "providerPaymentReference" = NULL, "paidAt" = NULL WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null
expect_like_rejection 'cash-on-delivery order' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fresh_o3l --command \
  'SET session_replication_role = replica; UPDATE "Order" SET "status" = '\''PAID'\'', "paymentMethod" = '\''STRIPE_DEBIT_CARD'\'', "paymentState" = '\''PAID'\'', "providerPaymentReference" = '\''pi_o3l_fixture_1'\'', "paidAt" = CURRENT_TIMESTAMP WHERE "id" = '\''00000000-0000-4000-8000-000000000401'\'';' >/dev/null

# CANCELLED is an enum value but the current payment-outcome check rejects it.
# Remove only that check in this disposable fixture so the O3L trigger itself
# is exercised, then restore a valid paid row and the exact production check.
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname fresh_o3l >/dev/null <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica;
ALTER TABLE "Order" DROP CONSTRAINT "Order_payment_outcome_check";
UPDATE "Order"
SET "status" = 'CANCELLED', "paymentState" = 'CANCELLED', "paidAt" = NULL
WHERE "id" = '00000000-0000-4000-8000-000000000401';
COMMIT;
SQL
expect_like_rejection 'cancelled Stripe order' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000401'
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname fresh_o3l >/dev/null <<'SQL'
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE "Order"
SET "status" = 'PAID', "paymentState" = 'PAID', "paidAt" = CURRENT_TIMESTAMP
WHERE "id" = '00000000-0000-4000-8000-000000000401';
ALTER TABLE "Order" ADD CONSTRAINT "Order_payment_outcome_check" CHECK (
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
COMMIT;
SQL
test "$(query_scalar fresh_o3l 'SELECT count(*) FROM pg_constraint WHERE conrelid = '\''public."Order"'\''::regclass AND conname = '\''Order_payment_outcome_check'\'';')" = '1'

expect_like_rejection 'mismatched attempt and order' \
  '00000000-0000-4000-8000-000000000301' '00000000-0000-4000-8000-000000000402'

DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' RUN_O2P_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o2p-postgres.e2e-spec.ts

cleanup
trap - EXIT INT TERM
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O3L container still exists: $container_name" >&2
  exit 1
fi
echo 'O3L disposable PostgreSQL gate: PASS'
