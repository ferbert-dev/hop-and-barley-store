#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2g-postgres-${$}"
database_user='hopbarley_o2g'
database_password='hopbarley_o2g_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260909120000_add_guest_checkout_drafts/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O2G container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT

docker run --rm --detach --name "$container_name" \
  --env POSTGRES_DB=fresh_o2g --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if ((ready_count >= 2)); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_o2g >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
}

apply_prior_migrations() {
  local database_name=$1
  for migration in \
    20260814104924_init \
    20260814153000_expand_catalog \
    20260822013000_add_secure_registration \
    20260822113000_add_auth_sessions \
    20260822150000_add_guest_carts \
    20260825090000_add_cart_reservations \
    20260826120000_add_orders \
    20260827100000_add_measured_product_quantities \
    20260827150000_disable_cart_reservations \
    20260828153000_add_customer_profile \
    20260828153000_add_product_activity_window \
    20260828163000_align_ingredient_product_types \
    20260828170000_enable_uploaded_product_assets \
    20260901110000_add_catalog_full_text_search \
    20260903173500_add_account_cart_ownership \
    20260905120000_use_eur_product_currency; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

docker exec "$container_name" createdb -U "$database_user" atomic_o2g
apply_prior_migrations atomic_o2g
if awk '/^COMMIT;$/ { print "SELECT 1 / 0;" } { print }' "$migration_path" | \
  docker exec --interactive "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname atomic_o2g >/dev/null 2>&1; then
  echo 'Expected injected O2G migration failure' >&2
  exit 1
fi
atomic_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o2g --command "
    SELECT
      to_regclass('public.\"CheckoutDraft\"') IS NULL,
      to_regclass('public.\"CheckoutDraftRequest\"') IS NULL,
      NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckoutDraftStatus');
  ")
test "$atomic_shape" = 't|t|t'

docker exec "$container_name" createdb -U "$database_user" upgrade_o2g
apply_prior_migrations upgrade_o2g
docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2g --command "
    INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\")
    VALUES (
      '97000000-0000-4000-8000-000000000001',
      'historical-o2g@example.test',
      'historical-o2g@example.test',
      CURRENT_TIMESTAMP
    );
    INSERT INTO \"Cart\" (
      \"id\", \"tokenDigest\", \"userId\", \"expiresAt\", \"updatedAt\"
    ) VALUES (
      '98000000-0000-4000-8000-000000000001',
      decode(repeat('aa', 32), 'hex'),
      '97000000-0000-4000-8000-000000000001',
      CURRENT_TIMESTAMP + interval '30 days',
      CURRENT_TIMESTAMP
    );
    INSERT INTO \"Order\" (
      \"id\", \"userId\", \"cartId\", \"idempotencyKey\", \"requestHash\",
      \"status\", \"paymentMethod\", \"paymentState\", \"currency\",
      \"itemSubtotalMinor\", \"shippingMinor\", \"totalMinor\", \"fullName\",
      \"phoneNumber\", \"city\", \"shippingAddress\", \"placedAt\", \"updatedAt\"
    ) VALUES (
      '99000000-0000-4000-8000-000000000001',
      '97000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      'historical-o2g-order', decode(repeat('bb', 32), 'hex'),
      'PLACED', 'CASH_ON_DELIVERY', 'DUE_ON_DELIVERY', 'EUR',
      0, 500, 500, 'Historical Customer', '+49 30 123456', 'Berlin',
      'Historical Street 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  " >/dev/null
docker exec --interactive "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2g < "$migration_path" >/dev/null
upgrade_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2g --command "
    SELECT
      to_regclass('public.\"CheckoutDraft\"') IS NOT NULL,
      to_regclass('public.\"CheckoutDraftRequest\"') IS NOT NULL,
      (SELECT count(*) FROM \"Order\"),
      (SELECT count(*) FROM \"Order\" WHERE \"userId\" = '97000000-0000-4000-8000-000000000001');
  ")
test "$upgrade_shape" = 't|t|1|1'

docker exec "$container_name" psql --single-transaction --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2g --command "
    DROP TABLE \"CheckoutDraftRequest\";
    DROP TABLE \"CheckoutDraft\";
    DROP TYPE \"CheckoutDraftStatus\";
  " >/dev/null
recovery_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2g --command "
    SELECT
      to_regclass('public.\"CheckoutDraft\"') IS NULL,
      (SELECT count(*) FROM \"Cart\"),
      (SELECT count(*) FROM \"Order\");
  ")
test "$recovery_shape" = 't|1|1'

fresh_url=$(database_url fresh_o2g)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O2G_POSTGRES_INTEGRATION=1 pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o2g-postgres.e2e-spec.ts

cleanup
trap - EXIT
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O2G container still exists: $container_name" >&2
  exit 1
fi
echo 'O2G disposable PostgreSQL gate: PASS'
