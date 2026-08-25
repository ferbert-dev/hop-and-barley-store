#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o1b-postgres-${$}"
database_user='hopbarley_o1b'
database_password='hopbarley_o1b_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260825090000_add_cart_reservations/migration.sql"

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

docker exec "$container_name" createdb -U "$database_user" atomic_o1b
apply_prior_migrations atomic_o1b
DATABASE_URL=$(database_url atomic_o1b) pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
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
DATABASE_URL=$(database_url upgrade_o1b) pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
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

fresh_url=$(database_url fresh_o1b)
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed

fresh_constraints=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname fresh_o1b \
  --command "
    SELECT count(*) FROM pg_constraint
    WHERE conname IN (
      'CartReservation_quantity_check',
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

echo 'O1B disposable PostgreSQL gate: PASS; atomicity, upgrade, rollback and cleanup proved'
