#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
container_name="hop-barley-a4-postgres-${$}"
database_user='hopbarley_a4'
database_password='hopbarley_a4_fixture'

cleanup() {
  docker stop "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$container_name" \
  --env POSTGRES_DB=fresh_a4 \
  --env POSTGRES_PASSWORD="$database_password" \
  --env POSTGRES_USER="$database_user" \
  --publish 127.0.0.1::5432 \
  postgres:17.6-alpine >/dev/null

ready_count=0
for _ in $(seq 1 60); do
  ready_count=$(docker logs "$container_name" 2>&1 | grep -c 'database system is ready to accept connections' || true)
  if (( ready_count >= 2 )); then
    break
  fi
  sleep 0.5
done

test "$ready_count" -ge 2
docker exec "$container_name" pg_isready -U "$database_user" -d fresh_a4 >/dev/null
published_address=$(docker port "$container_name" 5432/tcp)
database_port=${published_address##*:}
fresh_url="postgresql://${database_user}:${database_password}@127.0.0.1:${database_port}/fresh_a4?schema=public"

DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:migrate:deploy
DATABASE_URL="$fresh_url" pnpm --dir "$repo_root" --filter @hop-and-barley/api db:generate

docker exec "$container_name" createdb -U "$database_user" upgrade_a4
for migration in \
  20260814104924_init \
  20260814153000_expand_catalog \
  20260822013000_add_secure_registration \
  20260822113000_add_auth_sessions \
  20260822150000_add_guest_carts \
  20260825090000_add_cart_reservations \
  20260826120000_add_orders \
  20260827100000_add_measured_product_quantities \
  20260827150000_disable_cart_reservations; do
  docker exec --interactive "$container_name" psql \
    --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_a4 \
    < "$repo_root/apps/api/prisma/migrations/$migration/migration.sql"
done

docker exec "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_a4 \
  --command "INSERT INTO \"User\" (\"id\", \"email\", \"normalizedEmail\", \"updatedAt\") VALUES ('10000000-0000-4000-8000-000000000099', 'existing@example.com', 'existing@example.com', CURRENT_TIMESTAMP);" >/dev/null
docker exec --interactive "$container_name" psql \
  --set ON_ERROR_STOP=1 --username "$database_user" --dbname upgrade_a4 \
  < "$repo_root/apps/api/prisma/migrations/20260828153000_add_customer_profile/migration.sql" >/dev/null

upgrade_state=$(docker exec "$container_name" psql --tuples-only --no-align \
  --username "$database_user" --dbname upgrade_a4 \
  --command 'SELECT (SELECT count(*) FROM "User") || '\'':'\'' || (to_regclass('\''public."CustomerProfile"'\'') IS NOT NULL)::int || '\'':'\'' || (to_regclass('\''public."PrimaryAddress"'\'') IS NOT NULL)::int;')
test "$upgrade_state" = '1:1:1'

DATABASE_URL="$fresh_url" NODE_OPTIONS='--experimental-vm-modules' \
  RUN_A4_POSTGRES_INTEGRATION=1 \
  pnpm --dir "$repo_root" --filter @hop-and-barley/api exec jest \
  --config ./test/jest-e2e.json --runInBand --watchman=false \
  test/a4-postgres.e2e-spec.ts

echo 'A4 disposable PostgreSQL gate: PASS'
