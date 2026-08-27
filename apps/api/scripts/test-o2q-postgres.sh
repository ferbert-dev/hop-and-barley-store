#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2q-postgres-${$}"
database_user='hopbarley_o2q'
database_password='hopbarley_o2q_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260827100000_add_measured_product_quantities/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=bootstrap_o2q \
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
  --username "$database_user" --dbname bootstrap_o2q >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}

database_url() {
  printf 'postgresql://%s:%s@127.0.0.1:%s/%s?schema=public' \
    "$database_user" "$database_password" "$database_port" "$1"
}

apply_pre_o2q_migrations() {
  local database_name=$1
  for migration in \
    20260814104924_init \
    20260814153000_expand_catalog \
    20260822013000_add_secure_registration \
    20260822113000_add_auth_sessions \
    20260822150000_add_guest_carts \
    20260825090000_add_cart_reservations \
    20260826120000_add_orders; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

create_legacy_measured_fixtures() {
  local database_name=$1
  docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname "$database_name" \
    --command "
      INSERT INTO \"Product\" (
        \"id\", \"name\", \"slug\", \"teaser\", \"description\",
        \"priceMinor\", \"priceQualifier\", \"currency\", \"stockQuantity\",
        \"isActive\", \"imagePath\", \"specifications\", \"categoryId\", \"updatedAt\"
      ) VALUES
        ('71000000-0000-4000-8000-000000000001', 'Caramel Malt', 'caramel-malt', 'Legacy', 'Legacy', 299, 'per pound', 'USD', 11, true, '/assets/products/caramel-malt.webp', '[]', '10000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP),
        ('71000000-0000-4000-8000-000000000002', 'Maris Otter', 'maris-otter-malt', 'Legacy', 'Legacy', 249, 'per pound', 'USD', 2, true, '/assets/products/maris-otter-malt.webp', '[]', '10000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP),
        ('71000000-0000-4000-8000-000000000003', 'Citra Hops', 'citra-hops', 'Legacy', 'Legacy', 599, 'per 100g', 'USD', 1000, true, '/assets/products/citra-hops.webp', '[]', '10000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP),
        ('71000000-0000-4000-8000-000000000004', 'SafAle US-05', 'safale-us05-yeast', 'Legacy', 'Legacy', 325, 'per sachet', 'USD', 50, true, '/assets/products/safale-us05-yeast.webp', '[]', '10000000-0000-4000-8000-000000000003', CURRENT_TIMESTAMP),
        ('71000000-0000-4000-8000-000000000005', 'West Coast Kit', 'west-coast-ipa-kit', 'Legacy', 'Legacy', 4999, 'per kit', 'USD', 20, true, '/assets/products/west-coast-ipa-kit.webp', '[]', '10000000-0000-4000-8000-000000000005', CURRENT_TIMESTAMP);

      INSERT INTO \"Cart\" (\"id\", \"tokenDigest\", \"expiresAt\", \"updatedAt\")
      VALUES
        ('72000000-0000-4000-8000-000000000001', decode(repeat('11', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP),
        ('72000000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP),
        ('72000000-0000-4000-8000-000000000003', decode(repeat('33', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP),
        ('72000000-0000-4000-8000-000000000004', decode(repeat('44', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP),
        ('72000000-0000-4000-8000-000000000005', decode(repeat('55', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP);

      INSERT INTO \"CartItem\" (\"id\", \"cartId\", \"productId\", \"quantity\", \"updatedAt\")
      VALUES
        ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 11, CURRENT_TIMESTAMP),
        ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 2, CURRENT_TIMESTAMP),
        ('73000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', 4, CURRENT_TIMESTAMP),
        ('73000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005', 4, CURRENT_TIMESTAMP);

      INSERT INTO \"CartReservation\" (
        \"id\", \"cartId\", \"cartItemId\", \"productId\", \"quantity\",
        \"status\", \"reservedAt\", \"expiresAt\", \"updatedAt\"
      ) VALUES
        ('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 11, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 minutes', CURRENT_TIMESTAMP),
        ('74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 2, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 minutes', CURRENT_TIMESTAMP),
        ('74000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000003', '73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', 4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 minutes', CURRENT_TIMESTAMP),
        ('74000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000005', 4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 minutes', CURRENT_TIMESTAMP);

      UPDATE \"CartItem\" item
      SET \"currentReservationId\" = reservation.\"id\"
      FROM \"CartReservation\" reservation
      WHERE reservation.\"cartItemId\" = item.\"id\";

      INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\")
      VALUES ('75000000-0000-4000-8000-000000000001', 'legacy@example.com', 'legacy@example.com', CURRENT_TIMESTAMP);
      INSERT INTO \"Order\" (
        \"id\", \"userId\", \"cartId\", \"idempotencyKey\", \"requestHash\",
        \"status\", \"paymentMethod\", \"paymentState\", \"currency\",
        \"itemSubtotalMinor\", \"shippingMinor\", \"totalMinor\", \"fullName\",
        \"phoneNumber\", \"city\", \"shippingAddress\", \"placedAt\", \"updatedAt\"
      ) VALUES (
        '76000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001',
        '72000000-0000-4000-8000-000000000005', 'legacy-order', decode(repeat('aa', 32), 'hex'),
        'PLACED', 'CASH_ON_DELIVERY', 'DUE_ON_DELIVERY', 'USD', 1198, 500, 1698,
        'Legacy Brewer', '+1 555 0100', 'Portland', '10 Brewery Lane', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      );
      INSERT INTO \"OrderItem\" (
        \"id\", \"orderId\", \"productId\", \"productSlug\", \"productName\",
        \"priceQualifier\", \"unitPriceMinor\", \"quantity\", \"lineTotalMinor\"
      ) VALUES (
        '77000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
        '71000000-0000-4000-8000-000000000003', 'citra-hops', 'Citra Hops',
        'per 100g', 599, 2, 1198
      );
    " >/dev/null
}

test "$(tail -n 1 "$migration_path")" = 'COMMIT;'

docker exec "$container_name" createdb -U "$database_user" atomic_o2q
apply_pre_o2q_migrations atomic_o2q
create_legacy_measured_fixtures atomic_o2q
if {
  sed '$d' "$migration_path"
  printf '\nSELECT 1 / 0;\nCOMMIT;\n'
} | docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname atomic_o2q \
  >/dev/null 2>&1; then
  echo 'Expected injected O2Q migration failure' >&2
  exit 1
fi
atomic_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o2q \
  --command "
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Product'
          AND column_name = 'stockQuantity'
      ),
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CartItem'
          AND column_name = 'quantity'
      ),
      NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'SaleKind'
      );
  ")
test "$atomic_shape" = 't|t|t'

docker exec "$container_name" createdb -U "$database_user" upgrade_o2q
apply_pre_o2q_migrations upgrade_o2q
create_legacy_measured_fixtures upgrade_o2q
docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o2q \
  < "$migration_path"

upgrade_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2q \
  --command "
    SELECT string_agg(
      product.\"slug\" || ':' || item.\"amount\" || ':' || reservation.\"amount\" || ':' ||
      product.\"stockAmount\" || ':' || product.\"priceMinor\" || ':' ||
      product.\"priceBasisAmount\" || ':' || product.\"orderStepAmount\",
      ',' ORDER BY product.\"slug\"
    )
    FROM \"CartItem\" item
    JOIN \"CartReservation\" reservation ON reservation.\"cartItemId\" = item.\"id\"
    JOIN \"Product\" product ON product.\"id\" = item.\"productId\";
  ")
test "$upgrade_shape" = 'caramel-malt:4990000:4990000:4989512:66:100000:5000,citra-hops:400000:400000:100000000:599:100000:5000,maris-otter-malt:905000:905000:907184:55:100000:5000,west-coast-ipa-kit:4:4:20:4999:1:1'

snapshot_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2q \
  --command "
    SELECT \"saleKind\", \"amountUnit\", \"priceMinor\", \"priceBasisAmount\",
      \"amount\", \"lineTotalMinor\",
      \"lineTotalMinor\"::bigint = (
        (2 * \"priceMinor\"::bigint * \"amount\"::bigint + \"priceBasisAmount\"::bigint)
        / (2 * \"priceBasisAmount\"::bigint)
      )
    FROM \"OrderItem\"
    WHERE \"id\" = '77000000-0000-4000-8000-000000000001';
  ")
test "$snapshot_shape" = 'PACKAGE|EACH|599|1|2|1198|t'

metadata_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2q \
  --command "
    SELECT string_agg(
      \"slug\" || ':' || \"saleKind\" || ':' || \"amountUnit\" || ':' ||
      coalesce(\"packageNetWeightMg\"::text, 'null') || ':' ||
      coalesce(\"kitYieldVolumeMl\"::text, 'null'),
      ',' ORDER BY \"slug\"
    )
    FROM \"Product\"
    WHERE \"slug\" IN ('safale-us05-yeast', 'west-coast-ipa-kit');
  ")
test "$metadata_shape" = 'safale-us05-yeast:PACKAGE:EACH:11500:null,west-coast-ipa-kit:KIT:EACH:null:18927'

docker exec "$container_name" createdb -U "$database_user" verified_o2q
verified_database_url=$(database_url verified_o2q)
DATABASE_URL="$verified_database_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$verified_database_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:seed
RUN_O2Q_POSTGRES_INTEGRATION=1 DATABASE_URL="$verified_database_url" \
  NODE_OPTIONS='--experimental-vm-modules' \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api test:e2e \
  --testPathPatterns=o2q-postgres
