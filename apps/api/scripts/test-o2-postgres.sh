#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-o2-postgres-${$}"
database_user='hopbarley_o2'
database_password='hopbarley_o2_fixture'
migration_path="$repo_root/apps/api/prisma/migrations/20260826120000_add_orders/migration.sql"

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=bootstrap_o2 \
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
  --username "$database_user" --dbname bootstrap_o2 >/dev/null
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
    20260825090000_add_cart_reservations; do
    docker exec --interactive "$container_name" psql \
      --set ON_ERROR_STOP=1 --username "$database_user" --dbname "$database_name" \
      < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
  done
}

docker exec "$container_name" createdb -U "$database_user" atomic_o2
apply_prior_migrations atomic_o2
test "$(tail -n 1 "$migration_path")" = 'COMMIT;'
if {
  sed '$d' "$migration_path"
  printf '\nSELECT 1 / 0;\nCOMMIT;\n'
} | docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname atomic_o2 \
  >/dev/null 2>&1; then
  echo 'Expected injected O2 migration failure' >&2
  exit 1
fi
atomic_shape=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname atomic_o2 \
  --command "
    SELECT
      to_regclass('public.\"Order\"') IS NULL,
      NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CartReservation'
          AND column_name = 'orderId'
      );
  ")
test "$atomic_shape" = 't|t'

docker exec "$container_name" createdb -U "$database_user" verified_o2
apply_prior_migrations verified_o2
docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname verified_o2 \
  < "$migration_path"

verified_database_url=$(database_url verified_o2)
DATABASE_URL="$verified_database_url" pnpm --dir "$repo_root" \
  --filter @hop-and-barley/api db:seed
RUN_O2_POSTGRES_INTEGRATION=1 DATABASE_URL="$verified_database_url" \
  NODE_OPTIONS='--experimental-vm-modules' \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api test:e2e \
  --testPathPatterns=o2-postgres
