#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2d-postgres-${$}"
database_user='hopbarley_o2d'
database_password='hopbarley_o2d_fixture'
migration_name='20260910100000_add_first_purchase_discount_claims'
migration_path="$repo_root/apps/api/prisma/migrations/$migration_name/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O2D container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT INT TERM

docker run --rm --detach --name "$container_name" \
  --memory 1g --memory-swap 1g \
  --env POSTGRES_DB=fresh_o2d --env POSTGRES_PASSWORD="$database_password" \
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
docker exec "$container_name" pg_isready \
  --username "$database_user" --dbname fresh_o2d >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
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

query_scalar() {
  docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
    --username "$database_user" --dbname "$1" --command "$2"
}

docker exec "$container_name" createdb -U "$database_user" atomic_o2d
apply_prior_migrations atomic_o2d
if awk '/^COMMIT;$/ { print "SELECT 1 / 0;" } { print }' "$migration_path" | \
  docker exec --interactive "$container_name" psql --no-psqlrc \
    --set ON_ERROR_STOP=1 --username "$database_user" \
    --dbname atomic_o2d >/dev/null 2>&1; then
  echo 'Expected injected O2D migration failure' >&2
  exit 1
fi
atomic_shape=$(query_scalar atomic_o2d "
  SELECT
    to_regclass('public.\"PaymentAttempt\"') IS NULL,
    to_regclass('public.\"FirstPurchaseDiscountClaim\"') IS NULL,
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Order'
        AND column_name = 'discountMinor'
    );
")
test "$atomic_shape" = 't|t|t'

docker exec "$container_name" createdb -U "$database_user" upgrade_o2d
apply_prior_migrations upgrade_o2d
upgrade_url=$(database_url upgrade_o2d)
DATABASE_URL="$upgrade_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:seed >/dev/null
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2d --command "
    INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\")
    VALUES (
      'd1000000-0000-4000-8000-000000000001',
      'historical-o2d@example.test', 'historical-o2d@example.test',
      CURRENT_TIMESTAMP
    );
    INSERT INTO \"Cart\" (
      \"id\", \"tokenDigest\", \"expiresAt\", \"updatedAt\"
    ) VALUES (
      'd2000000-0000-4000-8000-000000000001',
      decode(repeat('d2', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days',
      CURRENT_TIMESTAMP
    );
    INSERT INTO \"Order\" (
      \"id\", \"userId\", \"cartId\", \"idempotencyKey\", \"requestHash\",
      \"status\", \"paymentMethod\", \"paymentState\",
      \"providerPaymentReference\", \"currency\",
      \"itemSubtotalMinor\", \"shippingMinor\", \"totalMinor\", \"fullName\",
      \"phoneNumber\", \"city\", \"shippingAddress\", \"placedAt\", \"paidAt\",
      \"updatedAt\"
    ) VALUES (
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'd2000000-0000-4000-8000-000000000001',
      'historical-o2d-order', decode(repeat('d3', 32), 'hex'),
      'PAID', 'STRIPE_DEBIT_CARD', 'PAID', 'historical-o2d-provider',
      'USD', 599, 500, 1099,
      'Historical Brewer', '+1 555 0100', 'Portland', '10 Brewery Lane',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  " >/dev/null
docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o2d \
  < "$migration_path" >/dev/null
upgrade_shape=$(query_scalar upgrade_o2d "
  SELECT
    to_regclass('public.\"PaymentAttempt\"') IS NOT NULL,
    to_regclass('public.\"PaymentAttemptItem\"') IS NOT NULL,
    to_regclass('public.\"FirstPurchaseDiscountClaim\"') IS NOT NULL,
    (SELECT \"currency\" || ':' || \"itemSubtotalMinor\" || ':' ||
      \"discountKind\" || ':' || \"discountBasisPoints\" || ':' ||
      \"discountMinor\" || ':' || \"shippingMinor\" || ':' || \"totalMinor\"
      FROM \"Order\" WHERE \"id\" = 'd3000000-0000-4000-8000-000000000001'),
    to_regclass('public.\"FirstPurchaseDiscountClaim_one_active_or_consumed_per_user_key\"') IS NOT NULL;
")
test "$upgrade_shape" = 't|t|t|USD:599:NONE:0:0:500:1099|t'

fresh_url=$(database_url fresh_o2d)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:seed >/dev/null
DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O2D_POSTGRES_INTEGRATION=1 pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o2d-postgres.e2e-spec.ts

cleanup
trap - EXIT INT TERM
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O2D container still exists: $container_name" >&2
  exit 1
fi
echo 'O2D disposable PostgreSQL gate: PASS'
