#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o1b-postgres-${$}"
database_user='hopbarley_o1b'
database_password='hopbarley_o1b_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260825090000_add_cart_reservations/migration.sql"
recovery_path="$repo_root/apps/api/prisma/migrations/20260825090000_add_cart_reservations/RECOVERY.md"
o2s_migration_path="$repo_root/apps/api/prisma/migrations/20260827150000_disable_cart_reservations/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_o1b \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" \
  --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_o1b >/dev/null
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
    20260822150000_add_guest_carts; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

apply_pre_o2s_migrations() {
  local database_name=$1
  apply_prior_migrations "$database_name"
  for migration in \
    20260825090000_add_cart_reservations \
    20260826120000_add_orders \
    20260827100000_add_measured_product_quantities; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

create_pre_o2s_fixtures() {
  local database_name=$1
  docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname "$database_name" \
    --command "
      INSERT INTO \"Product\" (
        \"id\", \"name\", \"slug\", \"teaser\", \"description\",
        \"priceMinor\", \"priceQualifier\", \"currency\", \"saleKind\",
        \"amountUnit\", \"priceBasisAmount\", \"minimumOrderAmount\",
        \"orderStepAmount\", \"maximumOrderAmount\", \"stockAmount\",
        \"packageNetWeightMg\", \"kitYieldVolumeMl\", \"isActive\",
        \"imagePath\", \"specifications\", \"categoryId\", \"updatedAt\"
      ) VALUES (
        '21000000-0000-4000-8000-000000000001', 'O2S Hops',
        'cascade-hops', 'O2S upgrade fixture', 'O2S upgrade fixture',
        599, 'per 100g', 'USD', 'WEIGHT', 'MILLIGRAM', 100000, 100000,
        100000, NULL, 123456700, NULL, NULL, true,
        '/assets/products/cascade-hops.webp', '[]',
        '10000000-0000-4000-8000-000000000001',
        '2026-08-27 12:00:00.000'
      );

      INSERT INTO \"User\" (
        \"id\", \"email\", \"normalizedEmail\", \"updatedAt\"
      ) VALUES (
        '22000000-0000-4000-8000-000000000001',
        'o2s-proof@example.com', 'o2s-proof@example.com',
        '2026-08-27 12:00:00.000'
      );

      INSERT INTO \"Cart\" (
        \"id\", \"tokenDigest\", \"expiresAt\", \"createdAt\", \"updatedAt\"
      ) VALUES
        ('23000000-0000-4000-8000-000000000001', decode(repeat('11', 32), 'hex'), '2026-09-27 12:00:00.000', '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('23000000-0000-4000-8000-000000000002', decode(repeat('22', 32), 'hex'), '2026-09-27 12:00:00.000', '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('23000000-0000-4000-8000-000000000003', decode(repeat('33', 32), 'hex'), '2026-09-27 12:00:00.000', '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('23000000-0000-4000-8000-000000000004', decode(repeat('44', 32), 'hex'), '2026-09-27 12:00:00.000', '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000');

      INSERT INTO \"CartItem\" (
        \"id\", \"cartId\", \"productId\", \"amount\", \"createdAt\", \"updatedAt\"
      ) VALUES
        ('24000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 100000, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('24000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 200000, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('24000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 300000, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000'),
        ('24000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', 400000, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000');

      INSERT INTO \"Order\" (
        \"id\", \"userId\", \"cartId\", \"idempotencyKey\", \"requestHash\",
        \"status\", \"paymentMethod\", \"paymentState\", \"currency\",
        \"itemSubtotalMinor\", \"shippingMinor\", \"totalMinor\", \"fullName\",
        \"phoneNumber\", \"city\", \"shippingAddress\", \"placedAt\", \"updatedAt\"
      ) VALUES (
        '25000000-0000-4000-8000-000000000001',
        '22000000-0000-4000-8000-000000000001',
        '23000000-0000-4000-8000-000000000004',
        'o2s-proof-order-0001', decode(repeat('55', 32), 'hex'),
        'PLACED', 'CASH_ON_DELIVERY', 'DUE_ON_DELIVERY', 'USD',
        2396, 500, 2896, 'O2S Proof', '+1 555 0100', 'Portland',
        '100 Migration Way', '2026-08-27 12:20:00.000',
        '2026-08-27 12:20:00.000'
      );

      INSERT INTO \"CartReservation\" (
        \"id\", \"cartId\", \"cartItemId\", \"productId\", \"amount\",
        \"status\", \"reservedAt\", \"expiresAt\", \"releasedAt\",
        \"consumedAt\", \"createdAt\", \"updatedAt\", \"orderId\"
      ) VALUES
        ('26000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '24000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', 100000, 'ACTIVE', CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP + interval '14 minutes', NULL, NULL, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000', NULL),
        ('26000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000002', '24000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', 200000, 'ACTIVE', CURRENT_TIMESTAMP - interval '20 minutes', CURRENT_TIMESTAMP - interval '5 minutes', NULL, NULL, '2026-08-27 12:00:00.000', '2026-08-27 12:00:00.000', NULL),
        ('26000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 300000, 'EXPIRED', '2026-08-27 11:00:00.000', '2026-08-27 11:15:00.000', NULL, NULL, '2026-08-27 11:00:00.000', '2026-08-27 11:15:00.000', NULL),
        ('26000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001', 400000, 'RELEASED', '2026-08-27 11:20:00.000', '2026-08-27 11:35:00.000', '2026-08-27 11:25:00.000', NULL, '2026-08-27 11:20:00.000', '2026-08-27 11:25:00.000', NULL),
        ('26000000-0000-4000-8000-000000000005', '23000000-0000-4000-8000-000000000004', '24000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', 500000, 'CONSUMED', '2026-08-27 11:40:00.000', '2026-08-27 11:55:00.000', NULL, '2026-08-27 11:50:00.000', '2026-08-27 11:40:00.000', '2026-08-27 11:50:00.000', '25000000-0000-4000-8000-000000000001');

      UPDATE \"CartItem\"
      SET \"currentReservationId\" = CASE \"id\"
        WHEN '24000000-0000-4000-8000-000000000001' THEN '26000000-0000-4000-8000-000000000001'::uuid
        WHEN '24000000-0000-4000-8000-000000000002' THEN '26000000-0000-4000-8000-000000000002'::uuid
      END
      WHERE \"id\" IN (
        '24000000-0000-4000-8000-000000000001',
        '24000000-0000-4000-8000-000000000002'
      );
    " >/dev/null
}

read_o2s_migration_with_failure() {
  awk '
    /^COMMIT;$/ {
      print "DO $o2s_injected_failure$"
      print "BEGIN"
      print "  RAISE EXCEPTION '\''O2S injected post-transition failure'\'';"
      print "END"
      print "$o2s_injected_failure$;"
    }
    { print }
  ' "$o2s_migration_path"
}

o2s_state_fingerprint() {
  local database_name=$1
  docker exec "$container_name" psql --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command "
      SELECT concat_ws('|',
        (SELECT count(*) FROM \"Product\"),
        (SELECT sum(\"stockAmount\") FROM \"Product\"),
        (SELECT count(*) FROM \"Cart\"),
        (SELECT count(*) FROM \"CartItem\"),
        (SELECT sum(\"amount\") FROM \"CartItem\"),
        (SELECT count(*) FROM \"CartReservation\"),
        (SELECT sum(\"amount\") FROM \"CartReservation\"),
        (SELECT count(*) FROM \"Order\"),
        (SELECT count(*) FROM \"CartReservation\" WHERE \"orderId\" IS NOT NULL),
        (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'ACTIVE'),
        (SELECT count(*) FROM \"CartItem\" WHERE \"currentReservationId\" IS NOT NULL),
        (SELECT md5(string_agg(
          concat_ws(':', \"id\"::text, \"cartId\"::text,
            coalesce(\"cartItemId\"::text, ''), \"productId\"::text,
            \"amount\"::text, \"status\"::text, \"reservedAt\"::text,
            \"expiresAt\"::text, coalesce(\"releasedAt\"::text, ''),
            coalesce(\"consumedAt\"::text, ''), \"createdAt\"::text,
            \"updatedAt\"::text, coalesce(\"orderId\"::text, '')),
          ',' ORDER BY \"id\")) FROM \"CartReservation\"),
        (SELECT md5(string_agg(
          concat_ws(':', \"id\"::text, \"cartId\"::text, \"productId\"::text,
            coalesce(\"currentReservationId\"::text, ''), \"amount\"::text,
            \"createdAt\"::text, \"updatedAt\"::text),
          ',' ORDER BY \"id\")) FROM \"CartItem\")
      );
    "
}

o2s_preserved_fingerprint() {
  local database_name=$1
  docker exec "$container_name" psql --tuples-only --no-align \
    --username "$database_user" --dbname "$database_name" \
    --command "
      SELECT md5(concat_ws('|',
        (SELECT string_agg(
          concat_ws(':', \"id\"::text, \"stockAmount\"::text,
            \"minimumOrderAmount\"::text, \"orderStepAmount\"::text,
            coalesce(\"maximumOrderAmount\"::text, '')),
          ',' ORDER BY \"id\") FROM \"Product\"),
        (SELECT string_agg(
          concat_ws(':', \"id\"::text, encode(\"tokenDigest\", 'hex'),
            \"expiresAt\"::text, \"createdAt\"::text),
          ',' ORDER BY \"id\") FROM \"Cart\"),
        (SELECT string_agg(
          concat_ws(':', \"id\"::text, \"cartId\"::text, \"productId\"::text,
            \"amount\"::text, \"createdAt\"::text),
          ',' ORDER BY \"id\") FROM \"CartItem\"),
        (SELECT string_agg(
          concat_ws(':', \"id\"::text, \"cartId\"::text,
            coalesce(\"cartItemId\"::text, ''), \"productId\"::text,
            \"amount\"::text, \"reservedAt\"::text, \"expiresAt\"::text,
            \"createdAt\"::text, coalesce(\"orderId\"::text, '')),
          ',' ORDER BY \"id\") FROM \"CartReservation\"),
        (SELECT string_agg(
          concat_ws(':', \"id\"::text, \"userId\"::text, \"cartId\"::text,
            \"idempotencyKey\", encode(\"requestHash\", 'hex'),
            \"itemSubtotalMinor\"::text, \"shippingMinor\"::text,
            \"totalMinor\"::text, \"placedAt\"::text),
          ',' ORDER BY \"id\") FROM \"Order\")
      ));
    "
}

create_legacy_catalog() {
  local database_name=$1
  docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname "$database_name" \
    --command "
      INSERT INTO \"Product\" (
        \"id\", \"name\", \"slug\", \"teaser\", \"description\",
        \"priceMinor\", \"priceQualifier\", \"currency\", \"stockQuantity\",
        \"isActive\", \"imagePath\", \"specifications\", \"categoryId\", \"updatedAt\"
      ) VALUES
        ('20000000-0000-4000-8000-000000000004', 'Cascade Hops', 'cascade-hops', 'Legacy O1B', 'Legacy O1B', 749, 'per 100g', 'USD', 100, true, '/assets/products/cascade-hops.webp', '[]', '10000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP),
        ('20000000-0000-4000-8000-000000000007', 'Centennial Hops', 'centennial-hops', 'Legacy O1B', 'Legacy O1B', 620, 'per 100g', 'USD', 100, true, '/assets/products/centennial-hops.webp', '[]', '10000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP);
    " >/dev/null
}

create_legacy_cart_line() {
  local database_name=$1
  docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname "$database_name" \
    --command "
      INSERT INTO \"Cart\" (\"tokenDigest\", \"expiresAt\", \"updatedAt\")
      VALUES (decode(repeat('ab', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP);
      INSERT INTO \"CartItem\" (\"cartId\", \"productId\", \"quantity\", \"updatedAt\")
      SELECT c.\"id\", p.\"id\", 2, CURRENT_TIMESTAMP
      FROM \"Cart\" c CROSS JOIN \"Product\" p
      WHERE p.\"slug\" = 'cascade-hops';
    " >/dev/null
}

read_recovery_transition() {
  awk '
    /<!-- O1B_COMPATIBILITY_TRANSITION_BEGIN -->/ { capture = 1; next }
    /<!-- O1B_COMPATIBILITY_TRANSITION_END -->/ { capture = 0; exit }
    capture && /^```/ { next }
    capture { print }
  ' "$recovery_path"
}

run_recovery_transition() {
  local database_name=$1
  local recovery_sql
  recovery_sql=$(read_recovery_transition)
  test -n "$recovery_sql"
  printf '%s\n' "$recovery_sql" | docker exec --interactive "$container_name" psql \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
    >/dev/null
}

create_recovery_fixtures() {
  local database_name=$1
  docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
    --username "$database_user" --dbname "$database_name" \
    --command "
      INSERT INTO \"Cart\" (\"id\", \"tokenDigest\", \"expiresAt\", \"updatedAt\")
      VALUES
        ('30000000-0000-4000-8000-000000000001', decode(repeat('cd', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP),
        ('30000000-0000-4000-8000-000000000002', decode(repeat('ef', 32), 'hex'), CURRENT_TIMESTAMP + interval '30 days', CURRENT_TIMESTAMP);

      INSERT INTO \"CartItem\" (\"id\", \"cartId\", \"productId\", \"quantity\", \"updatedAt\")
      VALUES
        ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'cascade-hops'), 2, CURRENT_TIMESTAMP),
        ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'cascade-hops'), 3, CURRENT_TIMESTAMP),
        ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'centennial-hops'), 4, CURRENT_TIMESTAMP);

      INSERT INTO \"CartReservation\" (
        \"id\", \"cartId\", \"cartItemId\", \"productId\", \"quantity\",
        \"status\", \"reservedAt\", \"expiresAt\", \"updatedAt\"
      )
      VALUES
        ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'cascade-hops'), 2, 'ACTIVE', CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP + interval '14 minutes', CURRENT_TIMESTAMP),
        ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'cascade-hops'), 3, 'ACTIVE', CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP + interval '14 minutes', CURRENT_TIMESTAMP),
        ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', (SELECT \"id\" FROM \"Product\" WHERE \"slug\" = 'centennial-hops'), 4, 'ACTIVE', CURRENT_TIMESTAMP - interval '20 minutes', CURRENT_TIMESTAMP - interval '5 minutes', CURRENT_TIMESTAMP);

      UPDATE \"CartItem\"
      SET \"currentReservationId\" = CASE \"id\"
        WHEN '40000000-0000-4000-8000-000000000001' THEN '50000000-0000-4000-8000-000000000001'::uuid
        WHEN '40000000-0000-4000-8000-000000000002' THEN '50000000-0000-4000-8000-000000000002'::uuid
        WHEN '40000000-0000-4000-8000-000000000003' THEN '50000000-0000-4000-8000-000000000003'::uuid
      END,
      \"updatedAt\" = CURRENT_TIMESTAMP
      WHERE \"id\" IN (
        '40000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000003'
      );
    " >/dev/null
}

docker exec "$container_name" createdb -U "$database_user" atomic_o1b
apply_prior_migrations atomic_o1b
create_legacy_catalog atomic_o1b
create_legacy_cart_line atomic_o1b
if {
  sed -n '1,$p' "$migration_path"
  printf '\nSELECT 1 / 0;\n'
} | docker exec --interactive "$container_name" psql --single-transaction \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname atomic_o1b >/dev/null 2>&1; then
  echo 'Expected injected O1B migration failure' >&2
  exit 1
fi
atomic_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o1b \
  --command "
    SELECT
      to_regclass('public.\"CartReservation\"') IS NULL,
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CartItem'
          AND column_name = 'currentReservationId'
      ),
      (SELECT count(*) FROM \"CartItem\");
  ")
test "$atomic_shape" = 't|t|1'

docker exec "$container_name" createdb -U "$database_user" upgrade_o1b
apply_prior_migrations upgrade_o1b
create_legacy_catalog upgrade_o1b
create_legacy_cart_line upgrade_o1b
docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o1b \
  < "$migration_path"
upgrade_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      (SELECT count(*) FROM \"CartItem\"),
      (SELECT count(*) FROM \"CartItem\" WHERE \"currentReservationId\" IS NULL),
      (SELECT count(*) FROM \"CartReservation\");
  ")
test "$upgrade_shape" = '1|1|0'

create_recovery_fixtures upgrade_o1b
recovery_shape_before=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      (SELECT count(*) FROM \"Cart\"),
      (SELECT count(*) FROM \"CartItem\"),
      (SELECT count(*) FROM \"Product\"),
      (SELECT sum(\"stockQuantity\") FROM \"Product\"),
      (SELECT count(*) FROM \"CartReservation\");
  ")
if docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o1b \
  --command "DELETE FROM \"CartItem\" WHERE \"id\" = '40000000-0000-4000-8000-000000000001';" \
  >/dev/null 2>&1; then
  echo 'Expected the pre-O1B remove shape to fail before the recovery transition' >&2
  exit 1
fi
pre_transition_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      (SELECT count(*) FROM \"CartItem\" WHERE \"id\" = '40000000-0000-4000-8000-000000000001'),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'ACTIVE'),
      (SELECT count(*) FROM \"CartItem\" WHERE \"currentReservationId\" IS NOT NULL);
  ")
test "$pre_transition_shape" = '1|3|3'

run_recovery_transition upgrade_o1b
recovery_shape_after=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      (SELECT count(*) FROM \"Cart\"),
      (SELECT count(*) FROM \"CartItem\"),
      (SELECT count(*) FROM \"Product\"),
      (SELECT sum(\"stockQuantity\") FROM \"Product\"),
      (SELECT count(*) FROM \"CartReservation\");
  ")
test "$recovery_shape_after" = "$recovery_shape_before"
transition_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      count(*) FILTER (WHERE \"status\" = 'ACTIVE'),
      count(*) FILTER (WHERE \"status\" = 'RELEASED'),
      count(*) FILTER (WHERE \"status\" = 'EXPIRED'),
      (SELECT count(*) FROM \"CartItem\" WHERE \"currentReservationId\" IS NOT NULL)
    FROM \"CartReservation\";
  ")
test "$transition_shape" = '0|2|1|0'
transition_fingerprint_before=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT string_agg(
      \"id\"::text || ':' || \"status\"::text || ':' ||
      coalesce(\"releasedAt\"::text, '') || ':' || \"updatedAt\"::text,
      ',' ORDER BY \"id\"
    )
    FROM \"CartReservation\";
  ")
run_recovery_transition upgrade_o1b
transition_fingerprint_after=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT string_agg(
      \"id\"::text || ':' || \"status\"::text || ':' ||
      coalesce(\"releasedAt\"::text, '') || ':' || \"updatedAt\"::text,
      ',' ORDER BY \"id\"
    )
    FROM \"CartReservation\";
  ")
test "$transition_fingerprint_after" = "$transition_fingerprint_before"

docker exec "$container_name" psql --single-transaction --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    DELETE FROM \"CartItem\"
    WHERE \"id\" = '40000000-0000-4000-8000-000000000001';
    DELETE FROM \"CartItem\"
    WHERE \"cartId\" = '30000000-0000-4000-8000-000000000002';
  " >/dev/null
compatibility_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      (SELECT count(*) FROM \"Cart\"),
      (SELECT count(*) FROM \"CartItem\" WHERE \"cartId\" IN (
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002'
      )),
      (SELECT count(*) FROM \"CartReservation\"),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"cartItemId\" IS NULL),
      (SELECT count(*) FROM \"Product\"),
      (SELECT sum(\"stockQuantity\") FROM \"Product\");
  ")
IFS='|' read -r carts_before _ products_before stock_before reservations_before \
  <<< "$recovery_shape_before"
test "$compatibility_shape" = "$carts_before|0|$reservations_before|$reservations_before|$products_before|$stock_before"

docker exec "$container_name" psql --single-transaction --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    ALTER TABLE \"CartItem\" DROP CONSTRAINT \"CartItem_currentReservationId_fkey\";
    DROP INDEX \"CartItem_currentReservationId_key\";
    ALTER TABLE \"CartItem\" DROP COLUMN \"currentReservationId\";
    DROP TABLE \"CartReservation\";
    DROP TYPE \"CartReservationStatus\";
  " >/dev/null
rollback_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o1b \
  --command "
    SELECT
      to_regclass('public.\"CartReservation\"') IS NULL,
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CartItem'
          AND column_name = 'currentReservationId'
      ),
      (SELECT count(*) FROM \"CartItem\");
  ")
test "$rollback_shape" = 't|t|1'

docker exec "$container_name" createdb -U "$database_user" atomic_o2s
apply_pre_o2s_migrations atomic_o2s
create_pre_o2s_fixtures atomic_o2s
atomic_o2s_before=$(o2s_state_fingerprint atomic_o2s)
if read_o2s_migration_with_failure | docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname atomic_o2s \
  >/dev/null 2>&1; then
  echo 'Expected injected O2S post-transition migration failure' >&2
  exit 1
fi
atomic_o2s_after=$(o2s_state_fingerprint atomic_o2s)
test "$atomic_o2s_after" = "$atomic_o2s_before"
atomic_o2s_metadata=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o2s \
  --command "
    SELECT
      (SELECT count(*) FROM pg_constraint WHERE conname IN (
        'CartReservation_dormant_status_check',
        'CartItem_currentReservation_dormant_check',
        'Product_weight_order_lattice_check'
      )),
      position('ACTIVE' IN (
        SELECT pg_get_expr(adbin, adrelid)
        FROM pg_attrdef
        WHERE adrelid = '\"CartReservation\"'::regclass
          AND adnum = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = '\"CartReservation\"'::regclass
              AND attname = 'status'
          )
      )) > 0;
  ")
test "$atomic_o2s_metadata" = '0|t'

docker exec "$container_name" createdb -U "$database_user" upgrade_o2s
apply_pre_o2s_migrations upgrade_o2s
create_pre_o2s_fixtures upgrade_o2s
preserved_o2s_before=$(o2s_preserved_fingerprint upgrade_o2s)
historical_o2s_before=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    SELECT md5(string_agg(
      concat_ws(':', \"id\"::text, \"cartId\"::text,
        coalesce(\"cartItemId\"::text, ''), \"productId\"::text,
        \"amount\"::text, \"status\"::text, \"reservedAt\"::text,
        \"expiresAt\"::text, coalesce(\"releasedAt\"::text, ''),
        coalesce(\"consumedAt\"::text, ''), \"createdAt\"::text,
        \"updatedAt\"::text, coalesce(\"orderId\"::text, '')),
      ',' ORDER BY \"id\"))
    FROM \"CartReservation\"
    WHERE \"status\" <> 'ACTIVE';
  ")
docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_o2s \
  < "$o2s_migration_path"
o2s_upgrade_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    SELECT concat_ws('|',
      (SELECT count(*) FROM \"Product\"),
      (SELECT sum(\"stockAmount\") FROM \"Product\"),
      (SELECT count(*) FROM \"Cart\"),
      (SELECT count(*) FROM \"CartItem\"),
      (SELECT sum(\"amount\") FROM \"CartItem\"),
      (SELECT count(*) FROM \"CartReservation\"),
      (SELECT sum(\"amount\") FROM \"CartReservation\"),
      (SELECT count(*) FROM \"Order\"),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"orderId\" IS NOT NULL),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'ACTIVE'),
      (SELECT count(*) FROM \"CartItem\" WHERE \"currentReservationId\" IS NOT NULL),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'RELEASED'),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'EXPIRED'),
      (SELECT count(*) FROM \"CartReservation\" WHERE \"status\" = 'CONSUMED'),
      (SELECT count(*) FROM pg_constraint WHERE conname IN (
        'CartReservation_dormant_status_check',
        'CartItem_currentReservation_dormant_check',
        'Product_weight_order_lattice_check'
      ))
    );
  ")
test "$o2s_upgrade_shape" = '1|123456700|4|4|1000000|5|1500000|1|1|0|0|2|2|1|3'
preserved_o2s_after=$(o2s_preserved_fingerprint upgrade_o2s)
test "$preserved_o2s_after" = "$preserved_o2s_before"
o2s_transition_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    SELECT concat_ws('|',
      (SELECT \"status\"::text FROM \"CartReservation\" WHERE \"id\" = '26000000-0000-4000-8000-000000000001'),
      (SELECT \"releasedAt\" IS NOT NULL FROM \"CartReservation\" WHERE \"id\" = '26000000-0000-4000-8000-000000000001'),
      (SELECT \"status\"::text FROM \"CartReservation\" WHERE \"id\" = '26000000-0000-4000-8000-000000000002'),
      (SELECT \"releasedAt\" IS NULL FROM \"CartReservation\" WHERE \"id\" = '26000000-0000-4000-8000-000000000002'),
      (SELECT bool_and(\"consumedAt\" IS NULL) FROM \"CartReservation\" WHERE \"id\" IN (
        '26000000-0000-4000-8000-000000000001',
        '26000000-0000-4000-8000-000000000002'
      )),
      position('EXPIRED' IN (
        SELECT pg_get_expr(adbin, adrelid)
        FROM pg_attrdef
        WHERE adrelid = '\"CartReservation\"'::regclass
          AND adnum = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = '\"CartReservation\"'::regclass
              AND attname = 'status'
          )
      )) > 0
    );
  ")
test "$o2s_transition_shape" = 'RELEASED|t|EXPIRED|t|t|t'
historical_o2s_after=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    SELECT md5(string_agg(
      concat_ws(':', \"id\"::text, \"cartId\"::text,
        coalesce(\"cartItemId\"::text, ''), \"productId\"::text,
        \"amount\"::text, \"status\"::text, \"reservedAt\"::text,
        \"expiresAt\"::text, coalesce(\"releasedAt\"::text, ''),
        coalesce(\"consumedAt\"::text, ''), \"createdAt\"::text,
        \"updatedAt\"::text, coalesce(\"orderId\"::text, '')),
      ',' ORDER BY \"id\"))
    FROM \"CartReservation\"
    WHERE \"id\" IN (
      '26000000-0000-4000-8000-000000000003',
      '26000000-0000-4000-8000-000000000004',
      '26000000-0000-4000-8000-000000000005'
    );
  ")
test "$historical_o2s_after" = "$historical_o2s_before"

if docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    INSERT INTO \"CartReservation\" (
      \"id\", \"cartId\", \"cartItemId\", \"productId\", \"amount\",
      \"status\", \"reservedAt\", \"expiresAt\", \"updatedAt\"
    ) VALUES (
      '26000000-0000-4000-8000-000000000099',
      '23000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000001', 100000, 'ACTIVE',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '15 minutes',
      CURRENT_TIMESTAMP
    );
  " >/dev/null 2>&1; then
  echo 'Expected O2S dormant reservation guard to reject ACTIVE history' >&2
  exit 1
fi
if docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    UPDATE \"CartItem\"
    SET \"currentReservationId\" = '26000000-0000-4000-8000-000000000003'
    WHERE \"id\" = '24000000-0000-4000-8000-000000000001';
  " >/dev/null 2>&1; then
  echo 'Expected O2S dormant pointer guard to reject a current reservation' >&2
  exit 1
fi
if docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname upgrade_o2s \
  --command "
    UPDATE \"Product\"
    SET \"maximumOrderAmount\" = 100100000
    WHERE \"id\" = '21000000-0000-4000-8000-000000000001';
  " >/dev/null 2>&1; then
  echo 'Expected O2S weight ceiling guard to reject more than 100 kg' >&2
  exit 1
fi

fresh_url=$(database_url fresh_o1b)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed

fresh_constraints=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname fresh_o1b \
  --command "
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'CartReservation_amount_check',
      'CartReservation_exact_lifetime_check',
      'CartReservation_state_check',
      'CartReservation_line_state_check',
      'CartReservation_cartId_fkey',
      'CartReservation_cartItemId_fkey',
      'CartReservation_productId_fkey',
      'CartItem_currentReservationId_fkey'
    );
  ")
fresh_indexes=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname fresh_o1b \
  --command "
    SELECT count(*) FROM pg_indexes
    WHERE indexname IN (
      'CartReservation_cartItemId_active_key',
      'CartReservation_cartId_status_expiresAt_idx',
      'CartReservation_cartItemId_reservedAt_idx',
      'CartReservation_productId_status_expiresAt_idx',
      'CartItem_currentReservationId_key'
    );
  ")
test "$fresh_constraints:$fresh_indexes" = '8:5'

DATABASE_URL="$fresh_url" \
  NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O1B_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/o1b-postgres.e2e-spec.ts

docker stop "$container_name" >/dev/null
trap - EXIT
for _ in $(seq 1 50); do
  if ! docker inspect "$container_name" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo 'O1B disposable PostgreSQL container cleanup failed' >&2
  exit 1
fi

echo 'O1B/O2S disposable PostgreSQL gate: PASS; reservation lifecycle, O2S history-preserving upgrade, injected rollback, guards and cleanup proved'
