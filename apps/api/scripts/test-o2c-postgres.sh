#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2c-postgres-${$}"
database_user='hopbarley_o2c'
database_password='hopbarley_o2c_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260905120000_use_eur_product_currency/migration.sql"

cleanup() {
  if docker inspect "$container_name" >/dev/null 2>&1; then
    docker stop "$container_name" >/dev/null
  fi
  echo "O2C disposable PostgreSQL cleanup: removed $container_name"
}
trap cleanup EXIT INT TERM

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=bootstrap_o2c \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" \
  --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c \
    'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready \
  --username "$database_user" --dbname bootstrap_o2c >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
}

apply_pre_o2c_migrations() {
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
    20260903173500_add_account_cart_ownership; do
    docker exec --interactive "$container_name" psql --no-psqlrc \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

seed_database() {
  local database_name=$1
  local url
  url=$(database_url "$database_name")
  DATABASE_URL="$url" pnpm --dir "$repo_root" \
    --filter @hop-and-barley/api db:seed
}

query_scalar() {
  local database_name=$1
  local query=$2
  docker exec "$container_name" psql --no-psqlrc --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command "$query"
}

test "$(tail -n 1 "$migration_path")" = 'COMMIT;'

docker exec "$container_name" createdb -U "$database_user" upgrade_o2c
apply_pre_o2c_migrations upgrade_o2c
seed_database upgrade_o2c
docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2c \
  --command "
    UPDATE \"Product\"
    SET
      \"currency\" = CASE WHEN \"slug\" = 'unmalted-wheat' THEN 'EUR' ELSE 'USD' END,
      \"updatedAt\" = '2026-09-01T10:00:00.000Z'::timestamptz;
    UPDATE \"Product\" SET \"isActive\" = false WHERE \"slug\" = 'citra-hops';
    UPDATE \"Product\" SET \"activeFrom\" = '2026-10-01T00:00:00.000Z'::timestamptz
      WHERE \"slug\" = 'cascade-hops';
    UPDATE \"Product\" SET \"activeUntil\" = '2026-08-01T00:00:00.000Z'::timestamptz
      WHERE \"slug\" = 'centennial-hops';

    INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\")
    VALUES ('81000000-0000-4000-8000-000000000001', 'o2c-history@example.com', 'o2c-history@example.com', '2026-09-01T10:00:00.000Z');
    INSERT INTO \"Cart\" (\"id\", \"tokenDigest\", \"expiresAt\", \"updatedAt\")
    VALUES
      ('82000000-0000-4000-8000-000000000001', decode(repeat('88', 32), 'hex'), '2026-10-01T00:00:00.000Z', '2026-09-01T10:00:00.000Z'),
      ('82000000-0000-4000-8000-000000000002', decode(repeat('99', 32), 'hex'), '2026-10-02T00:00:00.000Z', '2026-09-02T10:00:00.000Z');
    INSERT INTO \"CartItem\" (
      \"id\", \"cartId\", \"productId\", \"amount\", \"createdAt\", \"updatedAt\"
    ) SELECT
      '85000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002',
      \"id\", 200000, '2026-09-02T10:00:00.000Z', '2026-09-02T10:00:00.000Z'
    FROM \"Product\" WHERE \"slug\" = 'citra-hops';
    INSERT INTO \"Order\" (
      \"id\", \"userId\", \"cartId\", \"idempotencyKey\", \"requestHash\",
      \"status\", \"paymentMethod\", \"paymentState\", \"currency\",
      \"itemSubtotalMinor\", \"shippingMinor\", \"totalMinor\", \"fullName\",
      \"phoneNumber\", \"city\", \"shippingAddress\", \"placedAt\", \"updatedAt\"
    ) VALUES (
      '83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
      '82000000-0000-4000-8000-000000000001', 'o2c-history', decode(repeat('aa', 32), 'hex'),
      'PLACED', 'CASH_ON_DELIVERY', 'DUE_ON_DELIVERY', 'USD', 599, 500, 1099,
      'Historical Brewer', '+1 555 0100', 'Portland', '10 Brewery Lane',
      '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z'
    );
    INSERT INTO \"OrderItem\" (
      \"id\", \"orderId\", \"productId\", \"productSlug\", \"productName\",
      \"priceQualifier\", \"saleKind\", \"amountUnit\", \"priceMinor\",
      \"priceBasisAmount\", \"amount\", \"lineTotalMinor\", \"createdAt\"
    ) SELECT
      '84000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
      \"id\", \"slug\", \"name\", \"priceQualifier\", \"saleKind\", \"amountUnit\",
      \"priceMinor\", \"priceBasisAmount\", 100000, 599, '2026-09-01T10:00:00.000Z'
    FROM \"Product\" WHERE \"slug\" = 'citra-hops';
  " >/dev/null

product_before=$(query_scalar upgrade_o2c \
  'SELECT md5(string_agg(md5((to_jsonb(product_row) - '"'"'currency'"'"')::text), '"'"','"'"' ORDER BY "id")) FROM "Product" product_row;')
history_before=$(query_scalar upgrade_o2c \
  'SELECT md5((to_jsonb(order_row))::text) || '"'"':'"'"' || md5((to_jsonb(item_row))::text) FROM "Order" order_row CROSS JOIN "OrderItem" item_row WHERE order_row."id" = '"'"'83000000-0000-4000-8000-000000000001'"'"';')
cart_before=$(query_scalar upgrade_o2c \
  'SELECT md5(to_jsonb(cart_row)::text) || '"'"':'"'"' || md5(to_jsonb(item_row)::text) FROM "Cart" cart_row JOIN "CartItem" item_row ON item_row."cartId" = cart_row."id" WHERE cart_row."id" = '"'"'82000000-0000-4000-8000-000000000002'"'"';')

docker exec "$container_name" createdb -U "$database_user" \
  --template upgrade_o2c fail_closed_o2c
docker exec "$container_name" createdb -U "$database_user" \
  --template upgrade_o2c serialized_o2c

awk '
  { print }
  /LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE;/ { print "SELECT pg_sleep(2);" }
' "$migration_path" | docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname serialized_o2c \
  >/dev/null &
serialized_migration_pid=$!
lock_granted=0
for _ in $(seq 1 40); do
  lock_granted=$(query_scalar serialized_o2c \
    'SELECT count(*) FROM pg_locks WHERE relation = '"'"'public."Product"'"'"'::regclass AND mode = '"'"'AccessExclusiveLock'"'"' AND granted;')
  if test "$lock_granted" = '1'; then break; fi
  sleep 0.05
done
test "$lock_granted" = '1'
if docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname serialized_o2c \
  --command "SET lock_timeout = '200ms'; UPDATE \"Product\" SET \"currency\" = 'JPY' WHERE \"slug\" = 'cascade-hops';" \
  >/dev/null 2>&1; then
  echo 'Expected O2C product writer to wait behind the migration lock' >&2
  exit 1
fi
wait "$serialized_migration_pid"
serialized_state=$(query_scalar serialized_o2c \
  'SELECT count(*) FILTER (WHERE "currency" = '"'"'EUR'"'"') || '"'"':'"'"' || count(*) FILTER (WHERE "currency" <> '"'"'EUR'"'"') FROM "Product";')
test "$serialized_state" = '12:0'

docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o2c \
  < "$migration_path"

product_after=$(query_scalar upgrade_o2c \
  'SELECT md5(string_agg(md5((to_jsonb(product_row) - '"'"'currency'"'"')::text), '"'"','"'"' ORDER BY "id")) FROM "Product" product_row;')
history_after=$(query_scalar upgrade_o2c \
  'SELECT md5((to_jsonb(order_row))::text) || '"'"':'"'"' || md5((to_jsonb(item_row))::text) FROM "Order" order_row CROSS JOIN "OrderItem" item_row WHERE order_row."id" = '"'"'83000000-0000-4000-8000-000000000001'"'"';')
cart_after=$(query_scalar upgrade_o2c \
  'SELECT md5(to_jsonb(cart_row)::text) || '"'"':'"'"' || md5(to_jsonb(item_row)::text) FROM "Cart" cart_row JOIN "CartItem" item_row ON item_row."cartId" = cart_row."id" WHERE cart_row."id" = '"'"'82000000-0000-4000-8000-000000000002'"'"';')
upgrade_state=$(query_scalar upgrade_o2c \
  'SELECT count(*) || '"'"':'"'"' || count(*) FILTER (WHERE "currency" = '"'"'EUR'"'"') || '"'"':'"'"' || count(DISTINCT "categoryId") || '"'"':'"'"' || count(*) FILTER (WHERE NOT "isActive") || '"'"':'"'"' || count(*) FILTER (WHERE "activeFrom" IS NOT NULL) || '"'"':'"'"' || count(*) FILTER (WHERE "activeUntil" IS NOT NULL) FROM "Product";')
upgrade_default=$(query_scalar upgrade_o2c \
  'SELECT column_default FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' AND table_name = '"'"'Product'"'"' AND column_name = '"'"'currency'"'"';')
historical_currency=$(query_scalar upgrade_o2c \
  'SELECT "currency" || '"'"':'"'"' || "itemSubtotalMinor" || '"'"':'"'"' || "shippingMinor" || '"'"':'"'"' || "totalMinor" FROM "Order" WHERE "id" = '"'"'83000000-0000-4000-8000-000000000001'"'"';')
test "$product_after" = "$product_before"
test "$history_after" = "$history_before"
test "$cart_after" = "$cart_before"
test "$upgrade_state" = '12:12:5:1:1:1'
[[ "$upgrade_default" == *"'EUR'"* ]]
test "$historical_currency" = 'USD:599:500:1099'

docker exec "$container_name" psql --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname fail_closed_o2c \
  --command "UPDATE \"Product\" SET \"currency\" = 'JPY' WHERE \"slug\" = 'cascade-hops';" \
  >/dev/null
failure_before=$(query_scalar fail_closed_o2c \
  'SELECT md5(string_agg(md5(to_jsonb(product_row)::text), '"'"','"'"' ORDER BY "id")) FROM "Product" product_row;')
if docker exec --interactive "$container_name" psql --no-psqlrc \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname fail_closed_o2c \
  < "$migration_path" >/dev/null 2>&1; then
  echo 'Expected O2C migration to reject an unexpected product currency' >&2
  exit 1
fi
failure_after=$(query_scalar fail_closed_o2c \
  'SELECT md5(string_agg(md5(to_jsonb(product_row)::text), '"'"','"'"' ORDER BY "id")) FROM "Product" product_row;')
failure_state=$(query_scalar fail_closed_o2c \
  'SELECT count(*) FILTER (WHERE "currency" = '"'"'USD'"'"') || '"'"':'"'"' || count(*) FILTER (WHERE "currency" = '"'"'EUR'"'"') || '"'"':'"'"' || count(*) FILTER (WHERE "currency" = '"'"'JPY'"'"') FROM "Product";')
failure_default=$(query_scalar fail_closed_o2c \
  'SELECT column_default FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' AND table_name = '"'"'Product'"'"' AND column_name = '"'"'currency'"'"';')
test "$failure_after" = "$failure_before"
test "$failure_state" = '10:1:1'
[[ "$failure_default" == *"'USD'"* ]]

docker exec "$container_name" createdb -U "$database_user" fresh_o2c
fresh_url=$(database_url fresh_o2c)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:migrate:deploy
seed_database fresh_o2c
fresh_state=$(query_scalar fresh_o2c \
  'SELECT count(*) || '"'"':'"'"' || count(*) FILTER (WHERE "currency" = '"'"'EUR'"'"') || '"'"':'"'"' || count(DISTINCT "categoryId") FROM "Product";')
fresh_default=$(query_scalar fresh_o2c \
  'SELECT column_default FROM information_schema.columns WHERE table_schema = '"'"'public'"'"' AND table_name = '"'"'Product'"'"' AND column_name = '"'"'currency'"'"';')
test "$fresh_state" = '12:12:5'
[[ "$fresh_default" == *"'EUR'"* ]]

echo 'O2C disposable PostgreSQL gate: PASS'
