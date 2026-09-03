#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o1a-postgres-${$}"
database_user='hopbarley_o1a'
database_password='hopbarley_o1a_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260903173500_add_account_cart_ownership/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! docker inspect "$container_name" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "Disposable O1A container was not removed: $container_name" >&2
  return 1
}
trap cleanup EXIT

docker run --rm --detach --name "$container_name" \
  --env POSTGRES_DB=o1a --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then break; fi
  sleep 0.5
done
test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d o1a >/dev/null
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
    20260901110000_add_catalog_full_text_search; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

docker exec "$container_name" createdb -U "$database_user" atomic_o1a
apply_prior_migrations atomic_o1a
if {
  sed -n '1,$p' "$migration_path"
  printf '\nSELECT 1 / 0;\n'
} | docker exec --interactive "$container_name" psql --single-transaction \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname atomic_o1a \
  >/dev/null 2>&1; then
  echo 'Expected injected O1A migration failure' >&2
  exit 1
fi
atomic_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o1a \
  --command "
    SELECT
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cart'
          AND column_name = 'userId'
      ),
      to_regclass('public.\"Cart_userId_key\"') IS NULL,
      NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Cart_userId_fkey'
      );
  ")
test "$atomic_shape" = 't|t|t'

docker exec "$container_name" createdb -U "$database_user" recovery_o1a
apply_prior_migrations recovery_o1a
docker exec --interactive "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname recovery_o1a < "$migration_path"
docker exec "$container_name" psql --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname recovery_o1a --command "
    INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\")
    VALUES (
      '93000000-0000-4000-8000-000000000001',
      'recovery-o1a@example.test',
      'recovery-o1a@example.test',
      CURRENT_TIMESTAMP
    );
    INSERT INTO \"Cart\" (
      \"id\", \"tokenDigest\", \"userId\", \"expiresAt\", \"updatedAt\"
    ) VALUES (
      '94000000-0000-4000-8000-000000000001',
      decode(repeat('aa', 32), 'hex'),
      '93000000-0000-4000-8000-000000000001',
      CURRENT_TIMESTAMP + interval '1 day',
      CURRENT_TIMESTAMP
    );
  " >/dev/null
docker exec "$container_name" psql --single-transaction --set ON_ERROR_STOP=1 \
  --username "$database_user" --dbname recovery_o1a --command "
    ALTER TABLE \"Cart\" DROP CONSTRAINT \"Cart_userId_fkey\";
    DROP INDEX \"Cart_userId_key\";
    ALTER TABLE \"Cart\" DROP COLUMN \"userId\";
  " >/dev/null
recovery_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname recovery_o1a \
  --command "
    SELECT
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Cart'
          AND column_name = 'userId'
      ),
      to_regclass('public.\"Cart_userId_key\"') IS NULL,
      NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Cart_userId_fkey'
      ),
      (SELECT count(*) FROM \"Cart\");
  ")
test "$recovery_shape" = 't|t|t|1'

runtime_database_url=$(database_url o1a)

DATABASE_URL="$runtime_database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$runtime_database_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:seed
DATABASE_URL="$runtime_database_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_O1A_POSTGRES_INTEGRATION=1 pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api exec jest --config ./test/jest-e2e.json \
  --runInBand --watchman=false test/o1a-postgres.e2e-spec.ts

cleanup
trap - EXIT
if docker inspect "$container_name" >/dev/null 2>&1; then
  echo "Disposable O1A container still exists: $container_name" >&2
  exit 1
fi
echo 'O1A disposable PostgreSQL gate: PASS'
